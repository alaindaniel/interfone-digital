const db = require('../database/db');
const path = require('path');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const config = require('../config');

class NotificationService {
  constructor() {
    this.io = null;
    this.messaging = this.initializeFirebase();
  }

  initializeFirebase() {
    if (!config.FIREBASE_SERVICE_ACCOUNT_PATH) {
      console.warn('[FCM] Disabled: FIREBASE_SERVICE_ACCOUNT_PATH is not configured.');
      return null;
    }

    try {
      const credentialsPath = path.resolve(process.cwd(), config.FIREBASE_SERVICE_ACCOUNT_PATH);
      const app = getApps()[0] || initializeApp({ credential: cert(credentialsPath) });
      console.log('[FCM] Firebase Admin initialized.');
      return getMessaging(app);
    } catch (error) {
      console.error(`[FCM] Disabled: unable to initialize Firebase (${error.message}).`);
      return null;
    }
  }

  setIO(ioInstance) {
    this.io = ioInstance;
  }

  async sendCallNotification({ call, property, residents }) {
    const payload = {
      title: 'Chamada de Interfone',
      body: `${call.visitorName} está chamando a ${property.name}`,
      data: {
        type: 'INCOMING_CALL',
        callId: call.id,
        visitorName: call.visitorName,
        propertyId: property.id,
        propertyName: property.name,
        organizationId: call.organizationId,
        withVideo: String(call.withVideo || false)
      }
    };

    console.log(`[PUSH NOTIFICATION] Sending to ${residents.length} resident(s) for ${property.name}:`, payload.body);

    for (const resident of residents) {
      // Find registered FCM devices for resident
      const devices = db.find('devices', { userId: resident.id });
      for (const dev of devices) {
        if (!this.messaging) continue;
        try {
          await this.messaging.send({
            token: dev.token,
            notification: { title: payload.title, body: payload.body },
            data: payload.data,
            android: {
              priority: 'high',
              notification: {
                channelId: 'intercom_calls',
                sound: 'default',
                priority: 'max',
                defaultSound: true,
                defaultVibrateTimings: true,
                visibility: 'public'
              }
            }
          });
          console.log(`[FCM] Push sent to device ${dev.id}.`);
        } catch (error) {
          console.error(`[FCM] Push failed for device ${dev.id}: ${error.message}`);
          if (['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(error.code)) {
            db.delete('devices', dev.id);
          }
        }
      }

      // Also broadcast to resident socket room
      if (this.io) {
        this.io.to(`user:${resident.id}`).emit('incoming_call', {
          call,
          property,
          notification: payload
        });
      }
    }

    return payload;
  }

  notifyCallAnsweredByAnother(residents, answeredByUserId, callId) {
    if (!this.io) return;
    for (const resident of residents) {
      if (resident.id !== answeredByUserId) {
        this.io.to(`user:${resident.id}`).emit('call_answered_by_another', {
          callId,
          message: 'Chamada atendida por outro morador.'
        });
      }
    }
  }

  notifyCallEnded(callId, reason = 'ENDED') {
    if (!this.io) return;
    this.io.to(`call:${callId}`).emit('call_ended', {
      callId,
      reason
    });
  }
}

const notificationService = new NotificationService();
module.exports = notificationService;
