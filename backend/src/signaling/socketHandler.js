const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../database/db');
const callManager = require('../services/callManager');

// Store signaling session data for active calls:
// callId -> { offer: { callId, sdp, senderSocketId, withVideo }, answer: { callId, sdp, senderSocketId }, candidates: [] }
const activeSignaling = new Map();

function setupSocketHandler(io) {
  // Pass io instance to services
  callManager.setIO(io);
  const notificationService = require('../services/notificationService');
  notificationService.setIO(io);

  io.on('connection', (socket) => {
    console.log(`[SOCKET CONNECTED] id: ${socket.id}`);

    // Resident registration with JWT or userId
    socket.on('register_resident', ({ token, userId }) => {
      let residentId = userId;
      if (token) {
        try {
          const decoded = jwt.verify(token, config.JWT_SECRET);
          residentId = decoded.userId;
        } catch (err) {
          return socket.emit('auth_error', { message: 'Token de morador inválido' });
        }
      }

      if (!residentId) return;

      const user = db.findById('users', residentId);
      if (!user) return;

      socket.userId = residentId;
      socket.join(`user:${residentId}`);
      socket.join(`org:${user.organizationId}`);

      console.log(`[RESIDENT ONLINE] ${user.name} (${user.id}) joined user room`);
      socket.emit('registered', { status: 'ONLINE', userId: residentId });

      // Re-emit any active ringing call for this resident
      const residentLinks = db.find('resident_properties', { userId: residentId });
      const propIds = residentLinks.map(rp => rp.propertyId);
      for (const [callId, session] of callManager.activeCalls.entries()) {
        if (session.call && session.call.status === 'RINGING' && propIds.includes(session.call.propertyId)) {
          console.log(`[SOCKET] Re-emitting active incoming call ${callId} to reconnected resident ${user.name}`);
          socket.emit('incoming_call', {
            call: session.call,
            property: session.property,
            notification: {
              title: 'Chamada de Interfone',
              body: `${session.call.visitorName} está chamando a ${session.property.name}`
            }
          });
          break;
        }
      }
    });

    // Visitor or Resident joins a specific call room
    socket.on('join_call', ({ callId, role, visitorName }) => {
      if (!callId) return;
      socket.callId = callId;
      socket.role = role || 'VISITOR';
      socket.visitorName = visitorName || 'Visitante';
      socket.join(`call:${callId}`);

      console.log(`[JOIN CALL] socket ${socket.id} joined room call:${callId} as ${socket.role}`);

      // Broadcast peer joined to the room
      socket.to(`call:${callId}`).emit('peer_joined', {
        socketId: socket.id,
        role: socket.role,
        visitorName: socket.visitorName
      });

      // If an offer or answer was already sent before this peer joined, replay it immediately!
      const sig = activeSignaling.get(callId);
      if (sig) {
        if (socket.role === 'RESIDENT' && sig.offer) {
          console.log(`[WEBRTC REPLAY] Replaying cached offer to resident ${socket.id} for call ${callId}`);
          socket.emit('webrtc_offer', sig.offer);
        }
        if (socket.role === 'VISITOR' && sig.answer) {
          console.log(`[WEBRTC REPLAY] Replaying cached answer to visitor ${socket.id} for call ${callId}`);
          socket.emit('webrtc_answer', sig.answer);
        }
        // Replay any pending ICE candidates sent before this peer joined
        if (sig.candidates && sig.candidates.length > 0) {
          sig.candidates.forEach(cand => {
            if (cand.senderSocketId !== socket.id) {
              socket.emit('webrtc_ice_candidate', cand);
            }
          });
        }
      }
    });

    // WebRTC Offer
    socket.on('webrtc_offer', ({ callId, sdp, withVideo }) => {
      console.log(`[WEBRTC OFFER] from ${socket.id} for call ${callId}`);
      let sig = activeSignaling.get(callId);
      if (!sig) {
        sig = { offer: null, answer: null, candidates: [] };
        activeSignaling.set(callId, sig);
      }
      sig.offer = { callId, sdp, senderSocketId: socket.id, withVideo };

      socket.to(`call:${callId}`).emit('webrtc_offer', sig.offer);
    });

    // WebRTC Answer
    socket.on('webrtc_answer', ({ callId, sdp }) => {
      console.log(`[WEBRTC ANSWER] from ${socket.id} for call ${callId}`);
      let sig = activeSignaling.get(callId);
      if (!sig) {
        sig = { offer: null, answer: null, candidates: [] };
        activeSignaling.set(callId, sig);
      }
      sig.answer = { callId, sdp, senderSocketId: socket.id };

      socket.to(`call:${callId}`).emit('webrtc_answer', sig.answer);
    });

    // WebRTC ICE Candidate
    socket.on('webrtc_ice_candidate', ({ callId, candidate }) => {
      let sig = activeSignaling.get(callId);
      if (!sig) {
        sig = { offer: null, answer: null, candidates: [] };
        activeSignaling.set(callId, sig);
      }
      const candPayload = { callId, candidate, senderSocketId: socket.id };
      sig.candidates.push(candPayload);
      console.log(`[WEBRTC ICE] candidate for ${callId} from ${socket.id}`);

      socket.to(`call:${callId}`).emit('webrtc_ice_candidate', candPayload);
    });

    // Resident Answer Call via Socket
    socket.on('answer_call', ({ callId, userId }) => {
      const uId = userId || socket.userId;
      if (!callId || !uId) return;

      const result = callManager.answerCall(callId, uId, socket.id);
      if (result.success) {
        socket.join(`call:${callId}`);
        socket.emit('call_answer_success', result);
      } else {
        socket.emit('call_answer_failed', result);
      }
    });

    // Resident Decline Call via Socket
    socket.on('decline_call', ({ callId, userId }) => {
      const uId = userId || socket.userId;
      if (!callId) return;
      activeSignaling.delete(callId);
      callManager.declineCall(callId, uId);
    });

    // End Call
    socket.on('end_call', ({ callId }) => {
      const targetCallId = callId || socket.callId;
      if (!targetCallId) return;
      activeSignaling.delete(targetCallId);
      callManager.endCall(targetCallId, socket.role || 'USER');
    });

    // Toggle Audio/Video Media State
    socket.on('media_state_change', ({ callId, isMuted, isVideoOff }) => {
      const targetCallId = callId || socket.callId;
      if (!targetCallId) return;
      socket.to(`call:${targetCallId}`).emit('peer_media_state_change', {
        isMuted,
        isVideoOff
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`[SOCKET DISCONNECT] ${socket.id}`);
      if (socket.callId) {
        socket.to(`call:${socket.callId}`).emit('peer_disconnected', {
          socketId: socket.id
        });
      }
    });
  });
}

module.exports = setupSocketHandler;
