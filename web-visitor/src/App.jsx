import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Camera, Building2, User, ShieldAlert, Clock, ArrowRight, Volume2, CheckCircle2, RefreshCw } from 'lucide-react';

// Keep the API on the same computer that served this page.  `localhost` would
// point to the visitor's phone when the QR code is opened on the local network.
const API_BASE = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:4000`;

class RingtonePlayer {
  constructor() { this.ctx = null; this.osc1 = null; this.osc2 = null; this.gain = null; this.timer = null; }
  start() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      this.gain.connect(this.ctx.destination);
      let isPlaying = false;
      this.timer = setInterval(() => {
        if (!this.ctx) return;
        if (isPlaying) {
          if (this.osc1) { try { this.osc1.stop(); this.osc1.disconnect(); } catch(e){} }
          if (this.osc2) { try { this.osc2.stop(); this.osc2.disconnect(); } catch(e){} }
          isPlaying = false;
        } else {
          this.osc1 = this.ctx.createOscillator();
          this.osc2 = this.ctx.createOscillator();
          this.osc1.type = 'sine'; this.osc2.type = 'sine';
          this.osc1.frequency.setValueAtTime(440, this.ctx.currentTime);
          this.osc2.frequency.setValueAtTime(480, this.ctx.currentTime);
          this.osc1.connect(this.gain); this.osc2.connect(this.gain);
          this.osc1.start(); this.osc2.start();
          isPlaying = true;
        }
      }, 1000);
    } catch(e) { console.warn('Audio ringtone error', e); }
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.osc1) { try { this.osc1.stop(); this.osc1.disconnect(); } catch(e){} }
    if (this.osc2) { try { this.osc2.stop(); this.osc2.disconnect(); } catch(e){} }
    if (this.ctx) { try { this.ctx.close(); } catch(e){} }
    this.ctx = null;
  }
}

export default function VisitorApp() {
  const [step, setStep] = useState('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [token, setToken] = useState('qr-demo-jardim-principal');
  const [organization, setOrganization] = useState(null);
  const [accessPoint, setAccessPoint] = useState(null);
  const [properties, setProperties] = useState([]);
  const [settings, setSettings] = useState({});
  const [visitorName, setVisitorName] = useState('');
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [enableVideo, setEnableVideo] = useState(true);
  const [currentCall, setCurrentCall] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [callStatusMessage, setCallStatusMessage] = useState('Chamando...');
  const [callEndReason, setCallEndReason] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [remainingTimeout, setRemainingTimeout] = useState(60);

  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const ringtoneRef = useRef(new RingtonePlayer());
  const timerIntervalRef = useRef(null);
  const timeoutIntervalRef = useRef(null);

  useEffect(() => {
    let qrToken = 'qr-demo-jardim-principal';
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length > 2 && pathParts[1] === 'v') {
      qrToken = pathParts[2];
    } else {
      const params = new URLSearchParams(window.location.search);
      if (params.get('token')) qrToken = params.get('token');
    }
    setToken(qrToken);
    loadAccessInfo(qrToken);
  }, []);

  const loadAccessInfo = async (qrToken) => {
    try {
      setStep('loading'); setErrorMessage('');
      const res = await fetch(API_BASE + '/api/visitor/access/' + qrToken);
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Acesso não encontrado ou QR Code desativado.');
        setStep('error'); return;
      }
      setOrganization(data.organization);
      setAccessPoint(data.accessPoint);
      setProperties(data.properties);
      setSettings(data.settings);
      setRemainingTimeout(data.settings?.callTimeoutSeconds || 60);
      const savedName = localStorage.getItem('interfone_visitor_name');
      if (savedName) setVisitorName(savedName);
      setStep('name_step');
    } catch(err) {
      setErrorMessage('Erro de conexão com o servidor. Verifique sua internet.');
      setStep('error');
    }
  };

  const currentCallIdRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  const ICE_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ]
  };

  useEffect(() => {
    const socket = io(API_BASE, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('call_answered', async ({ callId, answeredBy }) => {
      ringtoneRef.current.stop();
      if (timeoutIntervalRef.current) clearInterval(timeoutIntervalRef.current);
      currentCallIdRef.current = callId;
      pendingCandidatesRef.current = [];
      setCallStatusMessage('Atendido por ' + answeredBy.name);
      setStep('in_call');
      startCallTimer();
      await createWebRTCOffer(callId);
    });
    socket.on('webrtc_answer', async ({ sdp }) => {
      console.log('[VISITOR WEBRTC] Received webrtc_answer');
      if (pcRef.current) {
        try {
          if (pcRef.current.signalingState === 'have-local-offer') {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
            console.log(`[VISITOR WEBRTC] Remote description set. Draining ${pendingCandidatesRef.current.length} queued ICE candidates`);
            for (const cand of pendingCandidatesRef.current) {
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
              } catch(e) {
                console.warn('[VISITOR WEBRTC] Queued candidate error:', e);
              }
            }
            pendingCandidatesRef.current = [];
          }
        } catch(e) {
          console.error('[VISITOR WEBRTC] setRemoteDescription error:', e);
        }
      }
    });
    socket.on('webrtc_ice_candidate', async ({ candidate }) => {
      if (!candidate) return;
      if (pcRef.current && pcRef.current.remoteDescription) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch(e) {
          console.warn('[VISITOR WEBRTC] addIceCandidate error:', e);
        }
      } else {
        console.log('[VISITOR WEBRTC] Queueing ICE candidate (remoteDescription not set yet)');
        pendingCandidatesRef.current.push(candidate);
      }
    });
    socket.on('call_declined', ({ message }) => {
      cleanupCall(); setCallEndReason(message || 'Chamada recusada pelo morador.'); setStep('ended');
    });
    socket.on('call_timeout', ({ message }) => {
      cleanupCall(); setCallEndReason(message || 'Não foi possível completar a chamada. Ninguém atendeu a tempo.'); setStep('ended');
    });
    socket.on('call_ended', () => {
      cleanupCall(); setCallEndReason('Chamada finalizada.'); setStep('ended');
    });
    return () => { socket.disconnect(); cleanupCall(); };
  }, []);

  const createWebRTCOffer = async (callId) => {
    try {
      if (pcRef.current) {
        try { pcRef.current.close(); } catch(e) {}
      }
      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcRef.current = pc;

      pc.oniceconnectionstatechange = () => {
        console.log('[VISITOR WEBRTC] ICE Connection State:', pc.iceConnectionState);
      };
      pc.onconnectionstatechange = () => {
        console.log('[VISITOR WEBRTC] Connection State:', pc.connectionState);
      };

      if (!localStreamRef.current) {
        await initLocalMedia();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current));
      }
      pc.ontrack = (event) => {
        console.log('[VISITOR WEBRTC] ontrack stream received:', event.track.kind);
        const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = stream;
      };
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('webrtc_ice_candidate', { callId, candidate: event.candidate });
        }
      };
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      socketRef.current.emit('webrtc_offer', { callId, sdp: pc.localDescription, withVideo: enableVideo });
    } catch(err) { console.error('[VISITOR WEBRTC] Offer error', err); }
  };

  const initLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: enableVideo });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch(err) {
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = audioOnly;
        return audioOnly;
      } catch(e) {}
    }
    return null;
  };

  const startCallTimer = () => {
    setCallDuration(0);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => setCallDuration(p => p + 1), 1000);
  };

  const cleanupCall = () => {
    ringtoneRef.current.stop();
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (timeoutIntervalRef.current) clearInterval(timeoutIntervalRef.current);
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
  };

  const handleContinueName = (e) => {
    e.preventDefault();
    if (!visitorName.trim()) return;
    localStorage.setItem('interfone_visitor_name', visitorName.trim());
    setStep('select_residence');
  };

  const handleStartCall = async (property) => {
    if (!property.isAvailable) return;
    setSelectedProperty(property);
    setStep('calling');
    setCallStatusMessage('Chamando ' + property.name + '...');
    setRemainingTimeout(settings.callTimeoutSeconds || 60);
    await initLocalMedia();
    ringtoneRef.current.start();
    try {
      const res = await fetch(API_BASE + '/api/visitor/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, propertyId: property.id, visitorName: visitorName.trim(), withVideo: enableVideo, socketId: socketRef.current?.id
        })
      });
      const data = await res.json();
      if (!res.ok) {
        cleanupCall(); setErrorMessage(data.error || 'Não foi possível iniciar a chamada.'); setStep('error'); return;
      }
      setCurrentCall(data.call);
      socketRef.current?.emit('join_call', { callId: data.call.id, role: 'VISITOR', visitorName: visitorName.trim() });
      let count = data.timeoutSeconds || 60;
      setRemainingTimeout(count);
      timeoutIntervalRef.current = setInterval(() => {
        count -= 1; setRemainingTimeout(count);
        if (count <= 0) clearInterval(timeoutIntervalRef.current);
      }, 1000);
    } catch(err) {
      cleanupCall(); setErrorMessage('Erro ao conectar ao servidor.'); setStep('error');
    }
  };

  const handleCancelCall = async () => {
    if (currentCall) {
      try { await fetch(API_BASE + '/api/visitor/call/' + currentCall.id + '/end', { method: 'POST' }); } catch(e){}
      socketRef.current?.emit('end_call', { callId: currentCall.id });
    }
    cleanupCall(); setCallEndReason('Chamada cancelada por você.'); setStep('ended');
  };

  const handleHangup = async () => {
    if (currentCall) {
      try { await fetch(API_BASE + '/api/visitor/call/' + currentCall.id + '/end', { method: 'POST' }); } catch(e){}
      socketRef.current?.emit('end_call', { callId: currentCall.id });
    }
    cleanupCall(); setCallEndReason('Chamada finalizada.'); setStep('ended');
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) { track.enabled = isMuted; setIsMuted(!isMuted); }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getVideoTracks()[0];
      if (track) { track.enabled = isVideoOff; setIsVideoOff(!isVideoOff); }
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return m + ':' + s;
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-between max-w-md mx-auto relative shadow-2xl overflow-hidden border-x border-slate-800 text-slate-100 font-sans">
      <audio ref={remoteAudioRef} autoPlay />
      <header className="pt-5 pb-3 px-5 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-slate-950 font-black">
              <Phone className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">Interfone Digital</h1>
              <p className="text-xs text-emerald-400 font-medium">{organization ? organization.name : 'Portaria Inteligente'}</p>
            </div>
          </div>
          {accessPoint && (
            <span className="text-[11px] bg-slate-800 text-slate-300 font-semibold px-2.5 py-1 rounded-full border border-slate-700">
              {accessPoint.name}
            </span>
          )}
        </div>
      </header>
      <main className="flex-1 p-5 flex flex-col justify-center">
        {step === 'loading' && (
          <div className="text-center py-16 space-y-4">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <h3 className="text-sm font-semibold text-slate-200">Carregando Interfone...</h3>
          </div>
        )}
        {step === 'error' && (
          <div className="text-center py-8 space-y-4 bg-slate-900 p-6 rounded-2xl border border-red-500/40">
            <div className="w-14 h-14 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Acesso Não Disponível</h3>
              <p className="text-xs text-slate-300 mt-1">{errorMessage}</p>
            </div>
            <button onClick={() => loadAccessInfo(token)} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4" /> Tentar Novamente
            </button>
          </div>
        )}
        {step === 'name_step' && (
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <User className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-extrabold text-white">Bem-vindo ao Interfone</h2>
              <p className="text-xs text-slate-400">Identifique-se para chamar a residência</p>
            </div>
            <form onSubmit={handleContinueName} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Qual é o seu nome?
                </label>
                <input
                  type="text" required placeholder="Ex: João da Silva / Entregador" value={visitorName}
                  onChange={(e) => setVisitorName(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button type="submit" disabled={!visitorName.trim()} className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 rounded-xl font-extrabold text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition">
                Continuar <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          </div>
        )}
        {step === 'select_residence' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h2 className="text-base font-extrabold text-white">Selecione a residência</h2>
                <p className="text-xs text-slate-400">Visitante: <strong className="text-emerald-400">{visitorName}</strong></p>
              </div>
              <button onClick={() => setStep('name_step')} className="text-xs text-slate-400 underline">Trocar nome</button>
            </div>
            <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white">Transmitir Câmera</span>
              </div>
              <input type="checkbox" checked={enableVideo} onChange={(e) => setEnableVideo(e.target.checked)} className="w-4 h-4 accent-emerald-500 cursor-pointer" />
            </div>
            <div className="grid grid-cols-2 gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
              {properties.map((prop) => {
                const isAvail = prop.isAvailable;
                return (
                  <button
                    key={prop.id} onClick={() => handleStartCall(prop)} disabled={!isAvail}
                    className={'p-3.5 rounded-xl border text-left flex flex-col justify-between min-h-[95px] ' + (isAvail ? 'bg-slate-800/90 hover:bg-slate-750 border-slate-700 hover:border-emerald-500 active:scale-95' : 'bg-slate-900/50 border-slate-800 opacity-40 cursor-not-allowed')}
                  >
                    <div>
                      <span className="text-[10px] font-semibold text-slate-400 block">{prop.block || 'Geral'}</span>
                      <h3 className="text-base font-black text-white">{prop.name}</h3>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className={'text-[10px] font-bold flex items-center gap-1 ' + (isAvail ? 'text-emerald-400' : 'text-slate-500')}>
                        <span className={'w-1.5 h-1.5 rounded-full ' + (isAvail ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600')} />
                        {isAvail ? 'Disponível' : (prop.status === 'DND' ? 'Não Perturbe' : 'Indisponível')}
                      </span>
                      {isAvail && <Phone className="w-3 h-3 text-emerald-400" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {step === 'calling' && (
          <div className="text-center space-y-5 py-4">
            <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
              <div className="relative w-20 h-20 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-black shadow-xl shadow-emerald-500/30">
                <Building2 className="w-9 h-9" />
              </div>
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 block">Chamando...</span>
              <h2 className="text-2xl font-black text-white mt-0.5">{selectedProperty?.name}</h2>
              <p className="text-xs text-slate-400">Aguardando atendimento ({remainingTimeout}s)</p>
            </div>
            {enableVideo && (
              <div className="w-28 h-36 mx-auto rounded-xl overflow-hidden border border-emerald-500/50 bg-black relative shadow-lg">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <span className="absolute bottom-1 right-1 text-[8px] bg-black/70 px-1 rounded text-white font-mono">Você</span>
              </div>
            )}
            <button onClick={handleCancelCall} className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition shadow-lg shadow-red-600/20">
              <PhoneOff className="w-4 h-4" /> Cancelar Chamada
            </button>
          </div>
        )}
        {step === 'in_call' && (
          <div className="flex flex-col justify-between h-full space-y-3">
            <div className="bg-slate-800 p-3 rounded-xl border border-slate-700 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Conectado
                </span>
                <h3 className="text-sm font-bold text-white">{selectedProperty?.name}</h3>
              </div>
              <span className="font-mono text-sm font-bold text-white">{formatTime(callDuration)}</span>
            </div>
            <div className="relative flex-1 min-h-[220px] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
              {enableVideo && !isVideoOff && (
                <div className="absolute top-2 right-2 w-24 h-32 rounded-lg overflow-hidden border border-emerald-400 bg-black z-20 shadow-lg">
                  <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <span className="absolute bottom-0.5 right-1 text-[7px] bg-black/80 px-1 rounded text-white">Você</span>
                </div>
              )}
              {!enableVideo && (
                <div className="text-center p-4 space-y-1">
                  <Volume2 className="w-8 h-8 text-emerald-400 mx-auto animate-pulse" />
                  <h4 className="text-sm font-bold text-white">Áudio Conectado</h4>
                  <p className="text-[11px] text-slate-400">Conversando com a {selectedProperty?.name}</p>
                </div>
              )}
            </div>
            <div className="bg-slate-900 p-3 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-around">
                <button onClick={toggleMute} className={'w-12 h-12 rounded-xl flex flex-col items-center justify-center text-xs ' + (isMuted ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-white')}>
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  <span className="text-[8px] font-bold mt-0.5">{isMuted ? 'Mudo' : 'Mic'}</span>
                </button>
                {enableVideo && (
                  <button onClick={toggleVideo} className={'w-12 h-12 rounded-xl flex flex-col items-center justify-center text-xs ' + (isVideoOff ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-white')}>
                    {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                    <span className="text-[8px] font-bold mt-0.5">{isVideoOff ? 'Vídeo Off' : 'Vídeo'}</span>
                  </button>
                )}
              </div>
              <button onClick={handleHangup} className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-base flex items-center justify-center gap-2 active:scale-95 transition shadow-lg shadow-red-600/30">
                <PhoneOff className="w-5 h-5" /> Desligar
              </button>
            </div>
          </div>
        )}
        {step === 'ended' && (
          <div className="text-center space-y-5 py-6">
            <div className="w-16 h-16 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto border border-slate-700">
              <PhoneOff className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Chamada Finalizada</h2>
              <p className="text-xs text-slate-400 mt-1">{callEndReason || 'Sessão encerrada.'}</p>
            </div>
            <div className="space-y-2 pt-3">
              <button onClick={() => setStep('select_residence')} className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition">
                <Phone className="w-4 h-4" /> Chamar Outra Residência
              </button>
              <button onClick={() => { setVisitorName(''); setStep('name_step'); }} className="w-full py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-medium text-xs">
                Reiniciar Identificação
              </button>
            </div>
          </div>
        )}
      </main>
      <footer className="p-3 text-center border-t border-slate-800/80 bg-slate-950 text-[10px] text-slate-500">
        Interfone Digital por QR Code • P2P WebRTC
      </footer>
    </div>
  );
}
