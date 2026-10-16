const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');
const config = require('../config');
const auditService = require('./auditService');
const notificationService = require('./notificationService');

class CallManager {
  constructor() {
    this.activeCalls = new Map(); // callId -> { call, timeoutTimer, visitorSocketId, residentSocketId, startTime }
    this.io = null;
  }

  setIO(ioInstance) {
    this.io = ioInstance;
  }

  createCall({ organizationId, accessPointId, propertyId, visitorName, clientSocketId, withVideo = false, ipAddress = '127.0.0.1' }) {
    const property = db.findById('properties', propertyId);
    if (!property) {
      throw new Error('Residência não encontrada');
    }

    if (property.status === 'UNAVAILABLE' || property.status === 'NO_RESIDENT') {
      throw new Error('Esta residência está indisponível no momento.');
    }

    // Check organization settings
    const settings = db.findOne('settings', { organizationId }) || {
      callTimeoutSeconds: config.DEFAULT_CALL_TIMEOUT_SECONDS,
      allowVideo: true,
      allowAudio: true,
      maxSimultaneousCalls: 10
    };

    // Check active calls limit
    const currentActive = this.getActiveCallsByOrg(organizationId);
    if (currentActive.length >= settings.maxSimultaneousCalls) {
      throw new Error('O sistema atingiu o limite de chamadas simultâneas. Tente novamente em alguns instantes.');
    }

    // Find residents linked to property
    const residentLinks = db.find('resident_properties', { propertyId });
    const residentUserIds = residentLinks.map(rp => rp.userId);
    const residents = db.find('users', u => residentUserIds.includes(u.id) && u.status === 'ACTIVE');

    if (residents.length === 0) {
      throw new Error('Não há moradores cadastrados ou ativos para esta residência.');
    }

    // Check if any resident is available (not all on DND)
    const availableResidents = residents.filter(r => r.availability !== 'DND');
    if (availableResidents.length === 0) {
      throw new Error('Os moradores desta residência estão no modo Não Perturbe no momento.');
    }

    const callId = `call-${uuidv4()}`;
    const newCall = {
      id: callId,
      organizationId,
      accessPointId,
      propertyId,
      visitorName,
      withVideo: Boolean(withVideo && settings.allowVideo),
      status: 'RINGING', // CALLING -> RINGING
      answeredByUserId: null,
      durationSeconds: 0,
      startedAt: new Date().toISOString(),
      answeredAt: null,
      endedAt: null,
      notifiedResidentsCount: residents.length
    };

    // Persist to database
    db.insert('calls', newCall);

    // Save participants
    for (const res of residents) {
      db.insert('call_participants', {
        id: `cp-${uuidv4()}`,
        callId,
        userId: res.id,
        status: 'NOTIFIED',
        answered: false
      });
    }

    // Audit log
    auditService.logAction(organizationId, null, 'CALL_INITIATED', ipAddress, callId, {
      visitorName,
      property: property.name,
      residentsNotified: residents.map(r => r.name)
    });

    // Schedule Ringing Timeout
    const timeoutSeconds = settings.callTimeoutSeconds || config.DEFAULT_CALL_TIMEOUT_SECONDS;
    const timeoutTimer = setTimeout(() => {
      this.handleCallTimeout(callId);
    }, timeoutSeconds * 1000);

    const callSession = {
      call: newCall,
      property,
      residents,
      timeoutTimer,
      visitorSocketId: clientSocketId,
      residentSocketId: null,
      startTime: Date.now()
    };

    this.activeCalls.set(callId, callSession);

    // Send push / socket notification to residents
    notificationService.sendCallNotification({
      call: newCall,
      property,
      residents
    });

    return { call: newCall, property, timeoutSeconds };
  }

  answerCall(callId, userId, residentSocketId) {
    const session = this.activeCalls.get(callId);
    if (!session) {
      const existing = db.findById('calls', callId);
      if (existing && existing.status !== 'RINGING') {
        return { success: false, reason: 'ALREADY_HANDLED', status: existing.status };
      }
      return { success: false, reason: 'CALL_NOT_FOUND' };
    }

    if (session.call.status !== 'RINGING') {
      return { success: false, reason: 'CALL_NOT_RINGING', status: session.call.status };
    }

    // Atomic Answer: First to answer wins
    clearTimeout(session.timeoutTimer);
    session.call.status = 'IN_PROGRESS';
    session.call.answeredByUserId = userId;
    session.call.answeredAt = new Date().toISOString();
    session.residentSocketId = residentSocketId;

    db.update('calls', callId, {
      status: 'IN_PROGRESS',
      answeredByUserId: userId,
      answeredAt: session.call.answeredAt
    });

    // Update participant record
    const participant = db.findOne('call_participants', { callId, userId });
    if (participant) {
      db.update('call_participants', participant.id, {
        status: 'ANSWERED',
        answered: true
      });
    }

    const answeringUser = db.findById('users', userId);

    auditService.logAction(session.call.organizationId, userId, 'CALL_ANSWERED', '127.0.0.1', callId, {
      answeredBy: answeringUser ? answeringUser.name : userId
    });

    // Notify other residents that someone answered
    notificationService.notifyCallAnsweredByAnother(session.residents, userId, callId);

    // Notify visitor and answering resident
    if (this.io) {
      this.io.to(`call:${callId}`).emit('call_answered', {
        callId,
        answeredBy: { id: userId, name: answeringUser ? answeringUser.name : 'Morador' }
      });
    }

    return { success: true, call: session.call, answeredBy: answeringUser };
  }

  declineCall(callId, userId, reason = 'DECLINED') {
    const session = this.activeCalls.get(callId);
    if (!session) return { success: false };

    clearTimeout(session.timeoutTimer);
    session.call.status = 'DECLINED';
    session.call.endedAt = new Date().toISOString();

    db.update('calls', callId, {
      status: 'DECLINED',
      endedAt: session.call.endedAt
    });

    const user = db.findById('users', userId);
    auditService.logAction(session.call.organizationId, userId, 'CALL_DECLINED', '127.0.0.1', callId, {
      declinedBy: user ? user.name : userId,
      reason
    });

    if (this.io) {
      this.io.to(`call:${callId}`).emit('call_declined', {
        callId,
        message: 'Chamada recusada pelo morador.'
      });
      // Also tell all residents in room
      for (const res of session.residents) {
        this.io.to(`user:${res.id}`).emit('call_canceled', { callId });
      }
    }

    this.activeCalls.delete(callId);
    return { success: true };
  }

  endCall(callId, endedBy = 'USER') {
    const session = this.activeCalls.get(callId);
    const existing = session ? session.call : db.findById('calls', callId);
    if (!existing) return { success: false };

    if (session) {
      clearTimeout(session.timeoutTimer);
    }

    const endedAt = new Date().toISOString();
    let durationSeconds = 0;
    if (existing.answeredAt) {
      durationSeconds = Math.max(1, Math.round((new Date(endedAt) - new Date(existing.answeredAt)) / 1000));
    }

    const finalStatus = existing.status === 'IN_PROGRESS' ? 'ENDED' : existing.status;

    db.update('calls', callId, {
      status: finalStatus,
      durationSeconds,
      endedAt
    });

    auditService.logAction(existing.organizationId, null, 'CALL_ENDED', '127.0.0.1', callId, {
      durationSeconds,
      endedBy
    });

    if (this.io) {
      this.io.to(`call:${callId}`).emit('call_ended', {
        callId,
        durationSeconds,
        endedBy
      });

      if (session) {
        for (const res of session.residents) {
          this.io.to(`user:${res.id}`).emit('call_canceled', { callId });
        }
      }
    }

    this.activeCalls.delete(callId);
    return { success: true, durationSeconds };
  }

  handleCallTimeout(callId) {
    const session = this.activeCalls.get(callId);
    if (!session || session.call.status !== 'RINGING') return;

    console.log(`[CALL TIMEOUT] Call ${callId} timed out after no response.`);

    session.call.status = 'MISSED';
    session.call.endedAt = new Date().toISOString();

    db.update('calls', callId, {
      status: 'MISSED',
      endedAt: session.call.endedAt
    });

    auditService.logAction(session.call.organizationId, null, 'CALL_TIMEOUT_MISSED', '127.0.0.1', callId, {
      message: 'Nenhum morador atendeu no tempo limite.'
    });

    if (this.io) {
      this.io.to(`call:${callId}`).emit('call_timeout', {
        callId,
        message: 'Não foi possível completar a chamada. Ninguém atendeu a tempo.'
      });

      for (const res of session.residents) {
        this.io.to(`user:${res.id}`).emit('call_missed', {
          callId,
          message: 'Chamada não atendida.'
        });
      }
    }

    this.activeCalls.delete(callId);
  }

  getActiveCallsByOrg(organizationId) {
    return Array.from(this.activeCalls.values())
      .filter(s => s.call.organizationId === organizationId)
      .map(s => s.call);
  }

  getCallSession(callId) {
    return this.activeCalls.get(callId);
  }
}

const callManager = new CallManager();
module.exports = callManager;
