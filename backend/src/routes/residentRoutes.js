const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { authenticate, requireResident } = require('../middleware/auth');
const callManager = require('../services/callManager');
const auditService = require('../services/auditService');

// Polling endpoint for Native Android Foreground Service (receives calls in background)
router.get('/active-incoming-call/:userId', (req, res) => {
  const { userId } = req.params;
  const residentProps = db.find('resident_properties', { userId });
  const propIds = residentProps.map(rp => rp.propertyId);

  for (const [callId, session] of callManager.activeCalls.entries()) {
    if (session.call && session.call.status === 'RINGING' && propIds.includes(session.call.propertyId)) {
      return res.json({
        hasCall: true,
        call: session.call,
        property: session.property
      });
    }
  }

  res.json({ hasCall: false });
});

router.use(authenticate);
router.use(requireResident);

// Resident Dashboard summary
router.get('/dashboard', (req, res) => {
  const userId = req.user.id;
  const user = db.findById('users', userId);

  const residentProps = db.find('resident_properties', { userId });
  const propIds = residentProps.map(rp => rp.propertyId);
  const properties = db.find('properties', p => propIds.includes(p.id));

  // Find calls for these properties
  const allCalls = db.find('calls', c => propIds.includes(c.propertyId));

  const todayStr = new Date().toISOString().split('T')[0];
  const callsToday = allCalls.filter(c => c.startedAt && c.startedAt.startsWith(todayStr));
  const answeredCount = allCalls.filter(c => c.status === 'ENDED' || c.status === 'IN_PROGRESS').length;
  const missedCount = allCalls.filter(c => c.status === 'MISSED' || c.status === 'TIMEOUT').length;

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      availability: user.availability || 'AVAILABLE',
      status: user.status
    },
    properties,
    stats: {
      totalCalls: allCalls.length,
      callsToday: callsToday.length,
      answeredCount,
      missedCount
    }
  });
});

// Update Resident Availability (AVAILABLE or DND)
router.post('/availability', (req, res) => {
  const { availability } = req.body;
  if (!['AVAILABLE', 'DND'].includes(availability)) {
    return res.status(400).json({ error: 'Status inválido. Use AVAILABLE ou DND.' });
  }

  const updatedUser = db.update('users', req.user.id, { availability });
  auditService.logAction(req.user.organizationId, req.user.id, 'AVAILABILITY_CHANGED', req.ip, req.user.id, {
    availability
  });

  res.json({ success: true, availability: updatedUser.availability });
});

// Register Device for Push Notifications
router.post('/device', (req, res) => {
  const { token, platform = 'android' } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Token do dispositivo é obrigatório' });
  }

  // Check if exists
  let device = db.findOne('devices', { userId: req.user.id, token });
  if (device) {
    db.update('devices', device.id, { lastSeenAt: new Date().toISOString(), platform });
  } else {
    device = db.insert('devices', {
      id: `dev-${Date.now()}`,
      userId: req.user.id,
      token,
      platform,
      lastSeenAt: new Date().toISOString()
    });
  }

  res.json({ success: true, deviceId: device.id });
});

// Fetch one active call after a push-notification tap opens the APK.
router.get('/calls/:callId', (req, res) => {
  const call = db.findById('calls', req.params.callId);
  if (!call) return res.status(404).json({ error: 'Chamada não encontrada' });

  const allowedProperties = db.find('resident_properties', { userId: req.user.id })
    .map(link => link.propertyId);
  if (!allowedProperties.includes(call.propertyId)) {
    return res.status(403).json({ error: 'Sem acesso a esta chamada' });
  }

  const property = db.findById('properties', call.propertyId);
  res.json({ call, property });
});

// Resident Call History with filters
router.get('/calls', (req, res) => {
  const userId = req.user.id;
  const { filter, status } = req.query; // filter: 'today', 'yesterday', '7days', 'all'

  const residentProps = db.find('resident_properties', { userId });
  const propIds = residentProps.map(rp => rp.propertyId);

  let calls = db.find('calls', c => propIds.includes(c.propertyId));

  const now = new Date();

  // Date filter
  if (filter === 'today') {
    const todayStr = now.toISOString().split('T')[0];
    calls = calls.filter(c => c.startedAt && c.startedAt.startsWith(todayStr));
  } else if (filter === 'yesterday') {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    calls = calls.filter(c => c.startedAt && c.startedAt.startsWith(yesterdayStr));
  } else if (filter === '7days') {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    calls = calls.filter(c => c.startedAt && new Date(c.startedAt) >= sevenDaysAgo);
  }

  // Status filter
  if (status && status !== 'all') {
    if (status === 'ANSWERED') {
      calls = calls.filter(c => c.status === 'ENDED' || c.status === 'IN_PROGRESS');
    } else if (status === 'MISSED') {
      calls = calls.filter(c => c.status === 'MISSED' || c.status === 'TIMEOUT');
    } else if (status === 'DECLINED') {
      calls = calls.filter(c => c.status === 'DECLINED');
    } else {
      calls = calls.filter(c => c.status === status);
    }
  }

  // Enrich with property and answered user details
  const enriched = calls.map(c => {
    const prop = db.findById('properties', c.propertyId);
    let answeredBy = null;
    if (c.answeredByUserId) {
      const u = db.findById('users', c.answeredByUserId);
      if (u) answeredBy = u.name;
    }
    return {
      ...c,
      propertyName: prop ? prop.name : 'Residência',
      propertyBlock: prop ? prop.block : '',
      answeredByName: answeredBy
    };
  });

  // Sort descending by startedAt
  enriched.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));

  res.json({ calls: enriched });
});

// Answer Call via API
router.post('/calls/:callId/answer', (req, res) => {
  const { callId } = req.params;
  const { socketId } = req.body;
  const result = callManager.answerCall(callId, req.user.id, socketId);
  if (!result.success) {
    return res.status(400).json({ error: result.reason || 'Não foi possível atender a chamada' });
  }
  res.json(result);
});

// Decline Call via API
router.post('/calls/:callId/decline', (req, res) => {
  const { callId } = req.params;
  const result = callManager.declineCall(callId, req.user.id);
  res.json(result);
});

// End Call via API
router.post('/calls/:callId/end', (req, res) => {
  const { callId } = req.params;
  const result = callManager.endCall(callId, 'RESIDENT');
  res.json(result);
});

module.exports = router;
