import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import {
  Phone,
  PhoneOff,
  PhoneIncoming,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Camera,
  Building2,
  User,
  Bell,
  Clock,
  ShieldCheck,
  Check,
  Moon,
  Sun,
  Filter,
  LogOut,
  Volume2,
  RefreshCw
} from 'lucide-react';

const DEFAULT_API_HOST = import.meta.env.VITE_API_URL || 'https://interfone-api.onrender.com';

function getInitialApiBase() {
  try {
    const saved = localStorage.getItem('interfone_server_url');
    if (saved && saved.trim() && !saved.includes('192.168.')) return saved.trim();
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.port === '3002') {
        return `${window.location.protocol}//${window.location.hostname}:4000`;
      }
    }
  } catch(e) {}
  return DEFAULT_API_HOST;
}

let API_BASE = getInitialApiBase();


const nativeIntercom = {
  isFirebaseConfigured: async () => {
    try {
      if (window.Capacitor?.Plugins?.IntercomNative?.isFirebaseConfigured) {
        const res = await window.Capacitor.Plugins.IntercomNative.isFirebaseConfigured();
        return Boolean(res?.available);
      }
    } catch (e) {}
    return false;
  },
  startService: (userId, apiBase) => {
    try {
      if (window.Capacitor?.Plugins?.IntercomNative) {
        window.Capacitor.Plugins.IntercomNative.startService({
          userId: userId || '',
          apiBase: apiBase || API_BASE
        });
      }
    } catch (e) {
      console.warn('[NATIVE] startService error:', e);
    }
  },
  enableSpeakerphone: () => {
    try {
      if (window.Capacitor?.Plugins?.IntercomNative?.enableSpeakerphone) {
        window.Capacitor.Plugins.IntercomNative.enableSpeakerphone();
      }
    } catch (e) {
      console.warn('[NATIVE] enableSpeakerphone error:', e);
    }
  },
  disableSpeakerphone: () => {
    try {
      if (window.Capacitor?.Plugins?.IntercomNative?.disableSpeakerphone) {
        window.Capacitor.Plugins.IntercomNative.disableSpeakerphone();
      }
    } catch (e) {
      console.warn('[NATIVE] disableSpeakerphone error:', e);
    }
  },
  playRingtone: (visitorName, propertyName) => {
    try {
      if (window.Capacitor?.Plugins?.IntercomNative) {
        window.Capacitor.Plugins.IntercomNative.playRingtone({
          visitorName: visitorName || 'Visitante',
          propertyName: propertyName || 'sua residência'
        });
      }
    } catch (e) {
      console.warn('[NATIVE] playRingtone error:', e);
    }
  },
  stopRingtone: () => {
    try {
      if (window.Capacitor?.Plugins?.IntercomNative) {
        window.Capacitor.Plugins.IntercomNative.stopRingtone();
      }
    } catch (e) {
      console.warn('[NATIVE] stopRingtone error:', e);
    }
  }
};

class ResidentRingtone {
  constructor() {
    this.ctx = null;
    this.timer = null;
  }
  start() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      let toggle = false;
      this.timer = setInterval(() => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(toggle ? 880 : 659, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.4);
        toggle = !toggle;
      }, 500);
    } catch(e) {}
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.ctx) { try { this.ctx.close(); } catch(e){} }
    this.ctx = null;
  }
}

export default function ResidentApp() {
  const [apiBase, setApiBase] = useState(getInitialApiBase());
  const [showServerModal, setShowServerModal] = useState(false);
  const [tempServerUrl, setTempServerUrl] = useState(getInitialApiBase());
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('interfone_res_token') || '');
  const [properties, setProperties] = useState([]);
  const [stats, setStats] = useState({ totalCalls: 0, callsToday: 0, answeredCount: 0, missedCount: 0 });
  const [availability, setAvailability] = useState('AVAILABLE');

  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [demoAccounts, setDemoAccounts] = useState([]);

  const [activeTab, setActiveTab] = useState('home');
  const [incomingCall, setIncomingCall] = useState(null);
  const [answeredAnotherBanner, setAnsweredAnotherBanner] = useState('');

  const [inCall, setInCall] = useState(false);
  const [currentCall, setCurrentCall] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [enableVideo, setEnableVideo] = useState(true);

  const [callHistory, setCallHistory] = useState([]);
  const [historyFilter, setHistoryFilter] = useState('today');
  const [statusFilter, setStatusFilter] = useState('all');

  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const ringtoneRef = useRef(new ResidentRingtone());
  const timerIntervalRef = useRef(null);
  const currentCallIdRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const isNegotiatingRef = useRef(false);

  const ICE_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ]
  };

  const checkActiveIncomingCall = async (targetUserId) => {
    const uid = targetUserId || user?.id;
    if (!uid) return;
    try {
      const res = await fetch(`${API_BASE}/api/resident/active-incoming-call/${uid}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.hasCall && data.call && data.call.status === 'RINGING') {
        currentCallIdRef.current = data.call.id;
        setIncomingCall({ ...data.call, property: data.property });
        ringtoneRef.current.start();
        nativeIntercom.playRingtone(data.call.visitorName, data.property?.name);
      }
    } catch(e) {}
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/auth/demo-accounts`)
      .then(r => r.json())
      .then(d => {
        setDemoAccounts(d.accounts.filter(a => a.role === 'RESIDENT'));
      })
      .catch(() => {});

    if (token) {
      loadDashboard(token);
    }
  }, [token]);

  async function openCallFromPush(callId) {
    if (!callId || !token) return;
    try {
      const res = await fetch(`${API_BASE}/api/resident/calls/${callId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const { call, property } = await res.json();
      if (call.status !== 'RINGING') return;
      setIncomingCall({ ...call, property });
      setAnsweredAnotherBanner('');
      ringtoneRef.current.start();
    } catch (error) {
      console.warn('[PUSH] Unable to load incoming call:', error);
    }
  }

  useEffect(() => {
    if (!token || !Capacitor.isNativePlatform()) return undefined;

    let registrationListener;
    let receivedListener;
    let actionListener;
    let cancelled = false;

    const setupPushNotifications = async () => {
      try {
        const isFCMReady = await nativeIntercom.isFirebaseConfigured();
        if (!isFCMReady) {
          console.log('[PUSH] Firebase não inicializado (sem google-services.json). Notificações ativas via WebSocket.');
          return;
        }

        const permission = await PushNotifications.requestPermissions();
        if (permission.receive !== 'granted' || cancelled) return;

        registrationListener = await PushNotifications.addListener('registration', async ({ value }) => {
          try {
            await fetch(`${API_BASE}/api/resident/device`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ token: value, platform: 'android' })
            });
          } catch (error) {
            console.warn('[PUSH] Unable to register device:', error);
          }
        });

        receivedListener = await PushNotifications.addListener('pushNotificationReceived', notification => {
          openCallFromPush(notification.data?.callId);
        });
        actionListener = await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
          openCallFromPush(notification.data?.callId);
        });
        await PushNotifications.register();
      } catch (err) {
        console.warn('[PUSH] Push notifications setup skipped:', err);
      }
    };

    setupPushNotifications().catch(error => console.warn('[PUSH] Setup failed:', error));
    return () => {
      cancelled = true;
      registrationListener?.remove();
      receivedListener?.remove();
      actionListener?.remove();
    };
  }, [token]);

  useEffect(() => {
    const socket = io(API_BASE, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    if (user) {
      socket.emit('register_resident', { token, userId: user.id });
    }

    socket.on('incoming_call', ({ call, property }) => {
      console.log('[RESIDENT APP] Incoming call received:', call);
      currentCallIdRef.current = call.id;
      setIncomingCall({ ...call, property });
      setAnsweredAnotherBanner('');
      ringtoneRef.current.start();
      nativeIntercom.playRingtone(call.visitorName, property?.name);
    });

    socket.on('call_answered_by_another', ({ message }) => {
      console.log('[RESIDENT APP] Call answered by another resident');
      ringtoneRef.current.stop();
    nativeIntercom.stopRingtone();
      setIncomingCall(null);
      setAnsweredAnotherBanner(message || 'Chamada atendida por outro morador.');
      setTimeout(() => setAnsweredAnotherBanner(''), 6000);
    });

    socket.on('call_canceled', () => {
      ringtoneRef.current.stop();
    nativeIntercom.stopRingtone();
      setIncomingCall(null);
    });

    socket.on('call_missed', () => {
      ringtoneRef.current.stop();
    nativeIntercom.stopRingtone();
      setIncomingCall(null);
      loadHistory();
    });

    socket.on('webrtc_offer', async ({ callId, sdp, withVideo }) => {
      const activeId = callId || currentCallIdRef.current;
      console.log('[RESIDENT APP] Received WebRTC offer for callId:', activeId);
      if (isNegotiatingRef.current) {
        console.log('[RESIDENT APP] Already negotiating WebRTC offer, ignoring duplicate');
        return;
      }
      await handleWebRTCOffer(activeId, sdp, withVideo);
    });

    socket.on('webrtc_ice_candidate', async ({ candidate }) => {
      if (!candidate) return;
      if (pcRef.current && pcRef.current.remoteDescription) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch(e) {
          console.warn('[RESIDENT APP] addIceCandidate error:', e);
        }
      } else {
        console.log('[RESIDENT APP] Queueing ICE candidate (remoteDescription not set yet)');
        pendingCandidatesRef.current.push(candidate);
      }
    });

    socket.on('call_ended', () => {
      console.log('[RESIDENT APP] Call ended by remote');
      cleanupResidentCall();
      loadHistory();
    });

    return () => {
      socket.disconnect();
      cleanupResidentCall();
    };
  }, [user, token]);

  const loadDashboard = async (authToken) => {
    try {
      const res = await fetch(`${API_BASE}/api/resident/dashboard`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (!res.ok) {
        handleLogout();
        return;
      }
      const data = await res.json();
      setUser(data.user);
      setProperties(data.properties);
      nativeIntercom.startService(data.user.id, API_BASE);
      setStats(data.stats);
      setAvailability(data.user.availability || 'AVAILABLE');
      checkActiveIncomingCall(data.user.id);
    } catch(e) {}
  };

  useEffect(() => {
    if (!user || inCall || incomingCall) return;
    const interval = setInterval(() => {
      checkActiveIncomingCall(user.id);
    }, 2000);
    return () => clearInterval(interval);
  }, [user, inCall, incomingCall]);

  const loadHistory = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/resident/calls?filter=${historyFilter}&status=${statusFilter}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setCallHistory(data.calls || []);
    } catch(e) {}
  };

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, historyFilter, statusFilter]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput, password: passwordInput })
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Erro ao fazer login');
        return;
      }
      localStorage.setItem('interfone_res_token', data.token);
      setToken(data.token);
      setUser(data.user);
      setProperties(data.properties);
      nativeIntercom.startService(data.user.id, API_BASE);
      setAvailability(data.user.availability || 'AVAILABLE');
    } catch(e) {
      setAuthError('Erro ao conectar ao servidor');
    }
  };

  const handleDemoLogin = async (demoUser) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: demoUser.email, password: 'morador123' })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('interfone_res_token', data.token);
        setToken(data.token);
        setUser(data.user);
        setProperties(data.properties);
        nativeIntercom.startService(data.user.id, API_BASE);
        setAvailability(data.user.availability || 'AVAILABLE');
      }
    } catch(e) {}
  };

  const handleLogout = () => {
    localStorage.removeItem('interfone_res_token');
    setToken('');
    setUser(null);
    cleanupResidentCall();
  };

  const toggleAvailability = async () => {
    const next = availability === 'AVAILABLE' ? 'DND' : 'AVAILABLE';
    try {
      const res = await fetch(`${API_BASE}/api/resident/availability`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ availability: next })
      });
      if (res.ok) setAvailability(next);
    } catch(e) {}
  };

  const handleAnswer = async () => {
    if (!incomingCall) return;
    ringtoneRef.current.stop();
    nativeIntercom.stopRingtone();
    nativeIntercom.enableSpeakerphone();
    const callId = incomingCall.id;
    currentCallIdRef.current = callId;

    // Join socket room immediately so we never miss the visitor's WebRTC offer
    socketRef.current?.emit('join_call', {
      callId,
      role: 'RESIDENT',
      userId: user.id
    });

    try {
      const res = await fetch(`${API_BASE}/api/resident/calls/${callId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ socketId: socketRef.current?.id })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Erro ao atender chamada');
        setIncomingCall(null);
        return;
      }

      setCurrentCall(incomingCall);
      setIncomingCall(null);
      setInCall(true);
      setCallDuration(0);

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);

      socketRef.current?.emit('answer_call', {
        callId,
        userId: user.id
      });

    } catch(e) {
      setIncomingCall(null);
    }
  };

  const handleDecline = async () => {
    if (!incomingCall) return;
    ringtoneRef.current.stop();
    nativeIntercom.stopRingtone();
    const callId = incomingCall.id;

    try {
      await fetch(`${API_BASE}/api/resident/calls/${callId}/decline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      socketRef.current?.emit('decline_call', { callId, userId: user.id });
    } catch(e) {}

    setIncomingCall(null);
  };

  const handleHangup = async () => {
    const activeId = currentCall?.id || currentCallIdRef.current;
    if (activeId) {
      try {
        await fetch(`${API_BASE}/api/resident/calls/${activeId}/end`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
        socketRef.current?.emit('end_call', { callId: activeId });
      } catch(e) {}
    }
    cleanupResidentCall();
    loadHistory();
  };

  const handleWebRTCOffer = async (callId, sdp, withVideo) => {
    try {
      isNegotiatingRef.current = true;
      const activeCallId = callId || currentCallIdRef.current;
      nativeIntercom.enableSpeakerphone();

      if (pcRef.current) {
        try { pcRef.current.close(); } catch(e) {}
      }

      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcRef.current = pc;

      pc.oniceconnectionstatechange = () => {
        console.log('[RESIDENT WEBRTC] ICE Connection State:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          nativeIntercom.enableSpeakerphone();
        }
      };
      pc.onconnectionstatechange = () => {
        console.log('[RESIDENT WEBRTC] Connection State:', pc.connectionState);
      };

      pc.ontrack = (event) => {
        console.log('[RESIDENT APP] Remote ontrack stream received:', event.track.kind);
        const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().catch(e => console.warn('[VIDEO PLAY]', e));
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          remoteAudioRef.current.play().catch(e => console.warn('[AUDIO PLAY]', e));
        }
        nativeIntercom.enableSpeakerphone();
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current && activeCallId) {
          socketRef.current.emit('webrtc_ice_candidate', {
            callId: activeCallId,
            candidate: event.candidate
          });
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: enableVideo
      }).catch(async () => {
        return await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
      });

      if (stream) {
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        stream.getTracks().forEach(t => pc.addTrack(t, stream));
      }

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Drain queued ICE candidates
      console.log(`[RESIDENT APP] Draining ${pendingCandidatesRef.current.length} queued ICE candidates`);
      for (const cand of pendingCandidatesRef.current) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch(e) {
          console.warn('[RESIDENT APP] Queued candidate error:', e);
        }
      }
      pendingCandidatesRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (socketRef.current && activeCallId) {
        console.log('[RESIDENT APP] Emitting webrtc_answer for callId:', activeCallId);
        socketRef.current.emit('webrtc_answer', {
          callId: activeCallId,
          sdp: pc.localDescription
        });
      }
    } catch(e) {
      console.error('[RESIDENT WEBRTC] Error:', e);
    } finally {
      isNegotiatingRef.current = false;
    }
  };

  const cleanupResidentCall = () => {
    isNegotiatingRef.current = false;
    pendingCandidatesRef.current = [];
    ringtoneRef.current.stop();
    nativeIntercom.stopRingtone();
    nativeIntercom.disableSpeakerphone();
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setInCall(false);
    setCurrentCall(null);
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center px-6 max-w-md mx-auto text-slate-100">
        <div className="text-center space-y-2 mb-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500 flex items-center justify-center mx-auto text-slate-950 shadow-xl shadow-emerald-500/20">
            <Phone className="w-8 h-8 fill-current" />
          </div>
          <h1 className="text-2xl font-black text-white">Interfone Morador</h1>
          <p className="text-xs text-slate-400">Acesso exclusivo para residentes</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-3 bg-slate-900 p-5 rounded-2xl border border-slate-800">
          {authError && <div className="p-2.5 rounded-xl bg-red-500/20 text-red-400 text-xs font-bold">{authError}</div>}
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">E-mail do Morador</label>
            <input
              type="email"
              required
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              placeholder="morador.casa1@interfone.com"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white font-medium"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1">Senha</label>
            <input
              type="password"
              required
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white font-medium"
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold rounded-xl text-sm transition active:scale-95 shadow-lg shadow-emerald-500/20"
          >
            Entrar no Aplicativo
          </button>
        </form>

        <div className="text-center mt-3">
          <button
            type="button"
            onClick={() => { setTempServerUrl(apiBase); setShowServerModal(true); }}
            className="text-[11px] text-slate-400 hover:text-emerald-400 font-mono inline-flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 transition active:scale-95"
          >
            ⚙️ Conectando a: <span className="text-emerald-400 font-bold underline">{apiBase}</span>
          </button>
        </div>

        {showServerModal && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-sm font-black text-white flex items-center gap-2">⚙️ IP / URL do Servidor</h3>
                <button onClick={() => setShowServerModal(false)} className="text-slate-400 hover:text-white font-black text-base">×</button>
              </div>
              <p className="text-xs text-slate-400">
                Digite o IP do computador na rede Wi-Fi onde o backend está rodando:
              </p>
              <input
                type="text"
                value={tempServerUrl}
                onChange={e => setTempServerUrl(e.target.value)}
                placeholder="http://10.0.0.169:4000"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-emerald-400 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const clean = tempServerUrl.trim().replace(/\/$/, '');
                    localStorage.setItem('interfone_server_url', clean);
                    API_BASE = clean;
                    setApiBase(clean);
                    setShowServerModal(false);
                    window.location.reload();
                  }}
                  className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-emerald-500/20"
                >
                  Salvar e Reconectar
                </button>
                <button
                  type="button"
                  onClick={() => setShowServerModal(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 space-y-2">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">
            Acesso Rápido de Testes (Casas 1 a 6)
          </p>
          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
            {demoAccounts.map(demo => (
              <button
                key={demo.id}
                onClick={() => handleDemoLogin(demo)}
                className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/60 text-left text-xs transition active:scale-95"
              >
                <strong className="text-white block truncate">{demo.name}</strong>
                <span className="text-[10px] text-emerald-400 font-semibold">{demo.properties[0]?.name || 'Casa'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between max-w-md mx-auto relative shadow-2xl border-x border-slate-800 text-slate-100 font-sans">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Toast banner when call answered by another resident */}
      {answeredAnotherBanner && (
        <div className="fixed top-3 left-4 right-4 max-w-md mx-auto z-50 bg-amber-500 text-slate-950 px-4 py-3 rounded-2xl font-black text-xs shadow-2xl flex items-center gap-2 animate-bounce">
          <Bell className="w-4 h-4" /> {answeredAnotherBanner}
        </div>
      )}

      {/* FULLSCREEN INCOMING CALL MODAL */}
      {incomingCall && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col justify-between p-6 max-w-md mx-auto animate-fadeIn">
          <div className="text-center space-y-4 pt-10">
            <div className="relative w-32 h-32 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
              <div className="relative w-24 h-24 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-black shadow-2xl">
                <PhoneIncoming className="w-12 h-12 animate-bounce" />
              </div>
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Interfone Tocando...</span>
              <h2 className="text-3xl font-black text-white mt-1">{incomingCall.visitorName}</h2>
              <p className="text-sm text-slate-400 mt-0.5">Está chamando a {incomingCall.property?.name || 'sua residência'}</p>
            </div>
          </div>

          <div className="space-y-3 pb-8">
            <button
              onClick={handleAnswer}
              className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-lg rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30 active:scale-95 transition"
            >
              <Phone className="w-6 h-6 fill-current" /> ATENDER INTERFONE
            </button>
            <button
              onClick={handleDecline}
              className="w-full py-3.5 bg-red-600/80 hover:bg-red-600 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition"
            >
              <PhoneOff className="w-4 h-4" /> RECUSAR
            </button>
          </div>
        </div>
      )}

      {/* ACTIVE CALL SCREEN */}
      {inCall ? (
        <div className="flex-1 p-5 flex flex-col justify-between">
          <div className="bg-slate-900 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-emerald-400 uppercase flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Chamada em Andamento
              </span>
              <h3 className="text-base font-bold text-white">{currentCall?.visitorName || 'Visitante'}</h3>
            </div>
            <span className="font-mono text-sm font-black text-white">{formatTime(callDuration)}</span>
          </div>

          <div className="relative flex-1 my-3 bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 flex items-center justify-center min-h-[260px]">
            <video ref={remoteVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

            {enableVideo && !isVideoOff && (
              <div className="absolute top-3 right-3 w-24 h-32 rounded-xl overflow-hidden border border-emerald-400 bg-black shadow-xl z-20">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <span className="absolute bottom-1 right-1 text-[7px] bg-black/80 px-1 rounded text-white">Você</span>
              </div>
            )}

            {!enableVideo && (
              <div className="text-center p-4 space-y-2">
                <Volume2 className="w-10 h-10 text-emerald-400 mx-auto animate-pulse" />
                <h4 className="text-sm font-bold text-white">Áudio em Tempo Real</h4>
                <p className="text-xs text-slate-400">Conversando com {currentCall?.visitorName}</p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <button
              onClick={handleHangup}
              className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black text-lg rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-red-600/30 active:scale-95 transition"
            >
              <PhoneOff className="w-6 h-6" /> Encerrar Interfone
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <header className="pt-5 pb-3 px-5 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between sticky top-0 z-30">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-black text-white leading-tight">INTERFONE MORADOR</h1>
                <p className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Conectado • {properties[0]?.name || 'Casa'}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-5 overflow-y-auto space-y-4">
            {activeTab === 'home' && (
              <div className="space-y-4 animate-fadeIn">
                {/* Availability status switcher */}
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 block font-semibold">Modo de Atendimento</span>
                    <h3 className="text-base font-black text-white mt-0.5">
                      {availability === 'AVAILABLE' ? 'Disponível para Chamadas' : 'Não Perturbe (DND)'}
                    </h3>
                  </div>
                  <button
                    onClick={toggleAvailability}
                    className={`px-3.5 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                      availability === 'AVAILABLE'
                        ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-600'
                        : 'bg-amber-500 text-slate-950 hover:bg-amber-600'
                    }`}
                  >
                    {availability === 'AVAILABLE' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    {availability === 'AVAILABLE' ? 'Disponível' : 'DND'}
                  </button>
                </div>

                {/* KPI stats */}
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-400 font-bold block">Hoje</span>
                    <span className="text-lg font-black text-white">{stats.callsToday}</span>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 text-center">
                    <span className="text-[10px] text-emerald-400 font-bold block">Atendidas</span>
                    <span className="text-lg font-black text-emerald-400">{stats.answeredCount}</span>
                  </div>
                  <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 text-center">
                    <span className="text-[10px] text-red-400 font-bold block">Perdidas</span>
                    <span className="text-lg font-black text-red-400">{stats.missedCount}</span>
                  </div>
                </div>

                {/* Resident info card */}
                <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80 space-y-2">
                  <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider">Sua Residência</h4>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Unidade:</span>
                    <span className="font-bold text-white">{properties[0]?.name} ({properties[0]?.block})</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Morador Titular:</span>
                    <span className="font-bold text-white">{user.name}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Telefone:</span>
                    <span className="font-bold text-white">{user.phone || '(11) 99999-0000'}</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-white">Histórico de Chamadas</h3>
                  <select
                    value={historyFilter}
                    onChange={e => setHistoryFilter(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-2 py-1 text-slate-200 font-semibold focus:outline-none"
                  >
                    <option value="today">Hoje</option>
                    <option value="yesterday">Ontem</option>
                    <option value="7days">Últimos 7 dias</option>
                    <option value="all">Todas</option>
                  </select>
                </div>

                <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                  {callHistory.length === 0 ? (
                    <div className="text-center py-10 text-xs text-slate-500 font-medium">
                      Nenhuma chamada registrada no período selecionado.
                    </div>
                  ) : (
                    callHistory.map(call => {
                      const isAns = call.status === 'ENDED' || call.status === 'IN_PROGRESS';
                      const isDec = call.status === 'DECLINED';
                      return (
                        <div key={call.id} className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                              isAns ? 'bg-emerald-500/20 text-emerald-400' : (isDec ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400')
                            }`}>
                              {isAns ? <Phone className="w-4 h-4" /> : <PhoneOff className="w-4 h-4" />}
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-white">{call.visitorName}</h4>
                              <span className="text-[10px] text-slate-400 block">
                                {new Date(call.startedAt).toLocaleDateString()} {new Date(call.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`text-[10px] font-black block ${
                              isAns ? 'text-emerald-400' : (isDec ? 'text-amber-400' : 'text-red-400')
                            }`}>
                              {isAns ? 'Atendida' : (isDec ? 'Recusada' : 'Não Atendida')}
                            </span>
                            {call.durationSeconds > 0 && (
                              <span className="text-[10px] text-slate-400 font-mono">
                                {formatTime(call.durationSeconds)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </main>

          {/* Bottom Tabs */}
          <nav className="bg-slate-900 border-t border-slate-800 p-2 flex justify-around sticky bottom-0 z-30">
            <button
              onClick={() => setActiveTab('home')}
              className={`flex flex-col items-center py-1 px-4 rounded-xl text-xs font-bold transition ${
                activeTab === 'home' ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400'
              }`}
            >
              <Building2 className="w-4 h-4 mb-0.5" /> Início
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex flex-col items-center py-1 px-4 rounded-xl text-xs font-bold transition ${
                activeTab === 'history' ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400'
              }`}
            >
              <Clock className="w-4 h-4 mb-0.5" /> Histórico
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
