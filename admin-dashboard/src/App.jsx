import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Building2, Users, Home, QrCode, PhoneCall, History, Shield, Settings,
  LogOut, Plus, Trash2, Edit, Download, Printer, RefreshCw, CheckCircle2,
  XCircle, AlertTriangle, Search, ExternalLink, Eye, Sliders, BarChart3,
  Phone, DoorClosed, Lock, Unlock
} from 'lucide-react';

// Use the host that served the dashboard so it also works from another device
// on the local network, where `localhost` refers to that other device.
const API_BASE = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:4000`;

export default function AdminDashboard() {
  const [token, setToken] = useState(localStorage.getItem('interfone_admin_token') || '');
  const [adminUser, setAdminUser] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  const [email, setEmail] = useState('admin@interfone.com');
  const [password, setPassword] = useState('admin123');
  const [authError, setAuthError] = useState('');

  const [kpi, setKpi] = useState({ totalProperties: 0, totalResidents: 0, callsToday: 0, answeredToday: 0, missedToday: 0, inProgressCalls: 0, activeQRCodes: 0 });
  const [charts, setCharts] = useState({ hourlyDistribution: [], statusBreakdown: {} });

  const [organizations, setOrganizations] = useState([]);
  const [accessPoints, setAccessPoints] = useState([]);
  const [properties, setProperties] = useState([]);
  const [residents, setResidents] = useState([]);
  const [qrCodes, setQrCodes] = useState([]);
  const [calls, setCalls] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [settingsData, setSettingsData] = useState({});

  const [printSheetData, setPrintSheetData] = useState(null);
  const [propertyModal, setPropertyModal] = useState(null);
  const [residentModal, setResidentModal] = useState(null);
  const [accessPointModal, setAccessPointModal] = useState(false);
  const [newApName, setNewApName] = useState('');
  const [newApDesc, setNewApDesc] = useState('');

  useEffect(() => {
    if (token) loadAllData();
  }, [token]);

  const loadAllData = async () => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [kpiRes, orgRes, apRes, propRes, resRes, qrRes, callRes, auditRes, setRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/dashboard/stats`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/organizations`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/access-points`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/properties`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/residents`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/qrcodes`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/calls`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/audit-logs`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/settings`, { headers }).then(r => r.json())
      ]);
      if (kpiRes.kpi) { setKpi(kpiRes.kpi); setCharts(kpiRes.charts); }
      if (orgRes.organizations) setOrganizations(orgRes.organizations);
      if (apRes.accessPoints) setAccessPoints(apRes.accessPoints);
      if (propRes.properties) setProperties(propRes.properties);
      if (resRes.residents) setResidents(resRes.residents);
      if (qrRes.qrCodes) setQrCodes(qrRes.qrCodes);
      if (callRes.calls) setCalls(callRes.calls);
      if (auditRes.logs) setAuditLogs(auditRes.logs);
      if (setRes.settings) setSettingsData(setRes.settings);
    } catch(err) {}
  };

  const handleLogin = async (e) => {
    e.preventDefault(); setAuthError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error || 'Credenciais inválidas'); return; }
      if (data.user.role !== 'ADMIN') { setAuthError('Acesso restrito a administradores'); return; }
      localStorage.setItem('interfone_admin_token', data.token);
      setToken(data.token); setAdminUser(data.user);
    } catch(err) { setAuthError('Erro ao conectar ao servidor'); }
  };

  const handleLogout = () => {
    localStorage.removeItem('interfone_admin_token');
    setToken(''); setAdminUser(null);
  };

  const handleOpenPrintSheet = async (qr) => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/qrcodes/${qr.id}/print-sheet`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setPrintSheetData(data);
    } catch(e) {}
  };

  const handleRegenerateQR = async (id) => {
    if (!confirm('Deseja gerar um novo token para este QR Code?')) return;
    try {
      await fetch(`${API_BASE}/api/admin/qrcodes/${id}/regenerate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      loadAllData();
    } catch(e) {}
  };

  const handleToggleQRStatus = async (id) => {
    try {
      await fetch(`${API_BASE}/api/admin/qrcodes/${id}/toggle-status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      loadAllData();
    } catch(e) {}
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/admin/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(settingsData)
      });
      if (res.ok) { alert('Configurações salvas!'); loadAllData(); }
    } catch(e) {}
  };

  const handleCreateAccessPoint = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/admin/access-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newApName, locationDescription: newApDesc })
      });
      if (res.ok) { setAccessPointModal(false); setNewApName(''); setNewApDesc(''); loadAllData(); }
    } catch(e) {}
  };

  const handleSaveProperty = async (e) => {
    e.preventDefault();
    const data = propertyModal.data;
    const isEdit = propertyModal.mode === 'edit';
    const url = isEdit ? `${API_BASE}/api/admin/properties/${data.id}` : `${API_BASE}/api/admin/properties`;
    try {
      await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data)
      });
      setPropertyModal(null); loadAllData();
    } catch(e) {}
  };

  const handleDeleteProperty = async (id) => {
    if (!confirm('Deseja excluir esta residência?')) return;
    try {
      await fetch(`${API_BASE}/api/admin/properties/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      loadAllData();
    } catch(e) {}
  };

  const handleSaveResident = async (e) => {
    e.preventDefault();
    const data = residentModal.data;
    const isEdit = residentModal.mode === 'edit';
    const url = isEdit ? `${API_BASE}/api/admin/residents/${data.id}` : `${API_BASE}/api/admin/residents`;
    try {
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(data)
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Erro ao salvar'); return; }
      setResidentModal(null); loadAllData();
    } catch(e) {}
  };

  const handleToggleResidentStatus = async (resident) => {
    const next = resident.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
    try {
      await fetch(`${API_BASE}/api/admin/residents/${resident.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: next })
      });
      loadAllData();
    } catch(e) {}
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500 flex items-center justify-center mx-auto text-slate-950 shadow-xl shadow-emerald-500/20">
              <Shield className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black text-white">Painel Administrativo</h1>
            <p className="text-xs text-slate-400">Gestão do Interfone Digital por QR Code</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            {authError && <div className="p-3 bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold rounded-xl">{authError}</div>}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">E-mail do Administrador</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white font-medium text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Senha</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white font-medium text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <button type="submit" className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-sm transition active:scale-95 shadow-lg shadow-emerald-500/20">
              Acessar Painel
            </button>
          </form>
          <div className="p-3 bg-slate-800/60 rounded-xl text-[11px] text-slate-400 border border-slate-700 text-center">
            Credenciais Demo: <strong>admin@interfone.com</strong> / <strong>admin123</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-4">
        <div className="space-y-6">
          <div className="flex items-center space-x-3 px-2 py-1">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-emerald-500/20">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white leading-tight">INTERFONE DIGITAL</h2>
              <span className="text-[10px] text-emerald-400 font-bold">Gestão Síndico Pro</span>
            </div>
          </div>
          <nav className="space-y-1">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
              { id: 'condos', label: 'Condomínio & Acessos', icon: DoorClosed },
              { id: 'properties', label: 'Residências', icon: Home },
              { id: 'residents', label: 'Moradores', icon: Users },
              { id: 'qrcodes', label: 'QR Codes & Impressão', icon: QrCode },
              { id: 'calls', label: 'Histórico de Chamadas', icon: PhoneCall },
              { id: 'audit', label: 'Auditoria & Logs', icon: Shield },
              { id: 'settings', label: 'Configurações', icon: Settings },
            ].map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${isActive ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20 font-black' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
        <div className="pt-4 border-t border-slate-800 space-y-2">
          <div className="px-2">
            <span className="text-[11px] text-slate-400 block font-medium">Condomínio:</span>
            <strong className="text-xs text-white block truncate">{organizations[0]?.name || 'Residencial Jardim'}</strong>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 rounded-xl text-xs font-bold transition">
            <LogOut className="w-4 h-4" /> <span>Sair do Painel</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-8 overflow-y-auto max-h-screen">
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black text-white">Dashboard Geral</h1>
                <p className="text-xs text-slate-400">Visão em tempo real das operações do interfone</p>
              </div>
              <button onClick={loadAllData} className="px-3.5 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 font-bold rounded-xl flex items-center gap-2 transition">
                <RefreshCw className="w-3.5 h-3.5" /> Atualizar
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-1">
                <span className="text-xs text-slate-400 font-bold flex items-center gap-1.5"><Home className="w-4 h-4 text-emerald-400" /> Residências</span>
                <div className="text-3xl font-black text-white">{kpi.totalProperties}</div>
                <span className="text-[10px] text-emerald-400 font-semibold">Casas 1 a {kpi.totalProperties}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-1">
                <span className="text-xs text-slate-400 font-bold flex items-center gap-1.5"><Users className="w-4 h-4 text-blue-400" /> Moradores</span>
                <div className="text-3xl font-black text-white">{kpi.totalResidents}</div>
                <span className="text-[10px] text-blue-400 font-semibold">Cadastrados no sistema</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-1">
                <span className="text-xs text-slate-400 font-bold flex items-center gap-1.5"><PhoneCall className="w-4 h-4 text-amber-400" /> Chamadas Hoje</span>
                <div className="text-3xl font-black text-white">{kpi.callsToday}</div>
                <span className="text-[10px] text-emerald-400 font-semibold">{kpi.answeredToday} Atendidas</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl space-y-1">
                <span className="text-xs text-slate-400 font-bold flex items-center gap-1.5"><QrCode className="w-4 h-4 text-purple-400" /> QR Codes Ativos</span>
                <div className="text-3xl font-black text-white">{kpi.activeQRCodes}</div>
                <span className="text-[10px] text-purple-400 font-semibold">Entrada Principal</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4">
                <h3 className="text-sm font-black text-white">Fluxo de Chamadas por Horário (Hoje)</h3>
                <div className="h-40 flex items-end gap-1.5 pt-6 px-2">
                  {charts.hourlyDistribution.map((count, hr) => {
                    const max = Math.max(...charts.hourlyDistribution, 1);
                    const heightPercent = (count / max) * 100;
                    return (
                      <div key={hr} className="flex-1 flex flex-col items-center gap-1">
                        <div style={{ height: `${Math.max(heightPercent, 6)}%` }} className={`w-full rounded-t-md ${count > 0 ? 'bg-emerald-500' : 'bg-slate-800'}`} />
                        {hr % 4 === 0 && <span className="text-[9px] text-slate-500 font-mono">{hr}h</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4">
                <h3 className="text-sm font-black text-white">Status Geral de Chamadas</h3>
                <div className="space-y-3 pt-2">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1"><span className="text-emerald-400">Atendidas</span><span className="text-white">{charts.statusBreakdown.answered || 0}</span></div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden"><div className="bg-emerald-500 h-full rounded-full" style={{ width: '80%' }} /></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1"><span className="text-red-400">Perdidas / Timeout</span><span className="text-white">{charts.statusBreakdown.missed || 0}</span></div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden"><div className="bg-red-500 h-full rounded-full" style={{ width: '15%' }} /></div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1"><span className="text-amber-400">Recusadas</span><span className="text-white">{charts.statusBreakdown.declined || 0}</span></div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden"><div className="bg-amber-500 h-full rounded-full" style={{ width: '5%' }} /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'condos' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div><h1 className="text-2xl font-black text-white">Condomínio & Acessos</h1><p className="text-xs text-slate-400">Gerenciamento multi-tenant de entradas e portarias</p></div>
              <button onClick={() => setAccessPointModal(true)} className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2">
                <Plus className="w-4 h-4" /> Novo Acesso
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accessPoints.map(ap => (
                <div key={ap.id} className="bg-slate-900 border border-slate-800 p-5 rounded-3xl flex items-center justify-between">
                  <div className="space-y-1">
                    <h4 className="text-base font-black text-white">{ap.name}</h4>
                    <p className="text-xs text-slate-400">{ap.locationDescription || 'Sem descrição'}</p>
                  </div>
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold">{ap.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'properties' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div><h1 className="text-2xl font-black text-white">Residências (Casas / Aptos)</h1><p className="text-xs text-slate-400">Nomenclaturas dinâmicas cadastradas</p></div>
              <button onClick={() => setPropertyModal({ mode: 'create', data: { name: '', block: 'Bloco A', unitNumber: '', status: 'AVAILABLE', residentIds: [] } })} className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2">
                <Plus className="w-4 h-4" /> Nova Residência
              </button>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800 text-slate-400 uppercase font-black">
                  <tr><th className="p-4">Unidade</th><th className="p-4">Bloco</th><th className="p-4">Moradores</th><th className="p-4">Status</th><th className="p-4 text-right">Ações</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {properties.map(p => (
                    <tr key={p.id} className="hover:bg-slate-850">
                      <td className="p-4 font-black text-white text-sm">{p.name}</td>
                      <td className="p-4 text-slate-300 font-semibold">{p.block}</td>
                      <td className="p-4">
                        {p.residents && p.residents.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {p.residents.map(r => <span key={r.id} className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 text-[10px] font-bold">{r.name}</span>)}
                          </div>
                        ) : <span className="text-slate-500 italic">Nenhum</span>}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black ${p.status === 'AVAILABLE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {p.status === 'AVAILABLE' ? 'Disponível' : 'Indisponível'}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button onClick={() => setPropertyModal({ mode: 'edit', data: { ...p, residentIds: p.residents?.map(r => r.id) || [] } })} className="p-1.5 bg-slate-800 text-slate-300 rounded-lg"><Edit className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDeleteProperty(p.id)} className="p-1.5 bg-slate-800 text-red-400 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'residents' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div><h1 className="text-2xl font-black text-white">Moradores</h1><p className="text-xs text-slate-400">Usuários autorizados a receber chamadas</p></div>
              <button onClick={() => setResidentModal({ mode: 'create', data: { name: '', email: '', phone: '', password: 'morador123', propertyIds: [] } })} className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2">
                <Plus className="w-4 h-4" /> Cadastrar Morador
              </button>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800 text-slate-400 uppercase font-black">
                  <tr><th className="p-4">Nome</th><th className="p-4">Login/E-mail</th><th className="p-4">Telefone</th><th className="p-4">Residência</th><th className="p-4">Status</th><th className="p-4 text-right">Ações</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {residents.map(r => (
                    <tr key={r.id} className="hover:bg-slate-850">
                      <td className="p-4 font-black text-white text-sm">{r.name}</td>
                      <td className="p-4 text-slate-300 font-mono">{r.email}</td>
                      <td className="p-4 text-slate-400 font-semibold">{r.phone || '-'}</td>
                      <td className="p-4"><span className="px-2 py-1 rounded-md bg-slate-800 text-emerald-400 font-black">{r.properties?.[0]?.name || '-'}</span></td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black ${r.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {r.status === 'ACTIVE' ? 'Ativo' : 'Bloqueado'}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button onClick={() => handleToggleResidentStatus(r)} className={`p-1.5 rounded-lg ${r.status === 'ACTIVE' ? 'bg-slate-800 text-slate-400 hover:text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                          {r.status === 'ACTIVE' ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => setResidentModal({ mode: 'edit', data: { ...r, propertyIds: r.properties?.map(p => p.id) || [] } })} className="p-1.5 bg-slate-800 text-slate-300 rounded-lg">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'qrcodes' && (
          <div className="space-y-6 animate-fadeIn">
            <div><h1 className="text-2xl font-black text-white">QR Codes & Impressão</h1><p className="text-xs text-slate-400">Tokens seguros de acesso e folha de impressão</p></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {qrCodes.map(qr => (
                <div key={qr.id} className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-4 shadow-xl">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Ponto de Acesso</span>
                      <h3 className="text-lg font-black text-white">{qr.accessPointName}</h3>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-black ${qr.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {qr.status}
                    </span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <img src={`${API_BASE}/api/admin/qrcodes/${qr.id}/png`} alt="QR Code" className="w-24 h-24 rounded-2xl bg-white p-1.5 border border-slate-700" />
                    <div className="space-y-1 text-xs">
                      <span className="text-slate-400 block">Token de Segurança:</span>
                      <code className="text-emerald-400 font-mono text-[11px] block bg-slate-800 px-2 py-1 rounded-lg truncate max-w-[200px]">{qr.token}</code>
                      <span className="text-[10px] text-slate-500 block">Criado em: {new Date(qr.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button onClick={() => handleOpenPrintSheet(qr)} className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-1.5">
                      <Printer className="w-3.5 h-3.5" /> Folha de Impressão
                    </button>
                    <a href={`${API_BASE}/api/admin/qrcodes/${qr.id}/png`} download={`qrcode-${qr.accessPointName}.png`} className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5">
                      <Download className="w-3.5 h-3.5" /> Baixar PNG
                    </a>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                    <button onClick={() => handleRegenerateQR(qr.id)} className="text-amber-400 hover:underline flex items-center gap-1 font-bold">
                      <RefreshCw className="w-3 h-3" /> Regenerar Token
                    </button>
                    <button onClick={() => handleToggleQRStatus(qr.id)} className="text-slate-400 hover:text-white">
                      {qr.status === 'ACTIVE' ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'calls' && (
          <div className="space-y-6 animate-fadeIn">
            <div><h1 className="text-2xl font-black text-white">Histórico Geral de Chamadas</h1><p className="text-xs text-slate-400">Auditoria completa de chamadas realizadas</p></div>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800 text-slate-400 uppercase font-black">
                  <tr><th className="p-4">Visitante</th><th className="p-4">Residência</th><th className="p-4">Ponto de Acesso</th><th className="p-4">Atendido Por</th><th className="p-4">Horário</th><th className="p-4">Duração</th><th className="p-4">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {calls.map(c => {
                    const isAns = c.status === 'ENDED' || c.status === 'IN_PROGRESS';
                    const isDec = c.status === 'DECLINED';
                    return (
                      <tr key={c.id} className="hover:bg-slate-850">
                        <td className="p-4 font-black text-white text-sm">{c.visitorName}</td>
                        <td className="p-4 font-bold text-emerald-400">{c.propertyName}</td>
                        <td className="p-4 text-slate-400">{c.accessPointName}</td>
                        <td className="p-4 text-slate-300">{c.answeredByName || '-'}</td>
                        <td className="p-4 text-slate-400">{new Date(c.startedAt).toLocaleDateString()} {new Date(c.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="p-4 font-mono font-bold text-white">{c.durationSeconds ? `${c.durationSeconds}s` : '-'}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-black ${isAns ? 'bg-emerald-500/20 text-emerald-400' : (isDec ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400')}`}>
                            {isAns ? 'Atendida' : (isDec ? 'Recusada' : 'Não Atendida')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-6 animate-fadeIn">
            <div><h1 className="text-2xl font-black text-white">Auditoria do Sistema</h1><p className="text-xs text-slate-400">Registro imutável de ações administrativas e chamadas</p></div>
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800 text-slate-400 uppercase font-black">
                  <tr><th className="p-4">Ação</th><th className="p-4">Usuário</th><th className="p-4">IP</th><th className="p-4">Data / Hora</th><th className="p-4">Detalhes</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {auditLogs.map(l => (
                    <tr key={l.id} className="hover:bg-slate-850">
                      <td className="p-4 font-black text-emerald-400 font-mono">{l.action}</td>
                      <td className="p-4 text-white font-bold">{l.userName}</td>
                      <td className="p-4 text-slate-400 font-mono">{l.ipAddress}</td>
                      <td className="p-4 text-slate-400">{new Date(l.createdAt).toLocaleDateString()} {new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-4 text-slate-300 font-mono text-[11px] max-w-xs truncate">{l.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6 animate-fadeIn">
            <div><h1 className="text-2xl font-black text-white">Configurações Gerais</h1><p className="text-xs text-slate-400">Tempo limite de chamada, permissões e anti-spam</p></div>
            <form onSubmit={handleSaveSettings} className="bg-slate-900 border border-slate-800 p-6 rounded-3xl space-y-5 max-w-2xl">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">Tempo Limite de Chamada (Segundos)</label>
                <input type="number" min="10" max="300" value={settingsData.callTimeoutSeconds || 60} onChange={e => setSettingsData({ ...settingsData, callTimeoutSeconds: e.target.value })} className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm font-bold text-white" />
                <span className="text-[10px] text-slate-500 mt-1 block">Tempo máximo que o interfone toca antes de encerrar automaticamente (Padrão: 60s).</span>
              </div>
              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={Boolean(settingsData.allowVideo)} onChange={e => setSettingsData({ ...settingsData, allowVideo: e.target.checked })} className="w-4 h-4 accent-emerald-500" />
                  <span className="text-xs font-bold text-white">Habilitar Chamadas com Câmera / Vídeo</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={Boolean(settingsData.allowMultiResidentRinging)} onChange={e => setSettingsData({ ...settingsData, allowMultiResidentRinging: e.target.checked })} className="w-4 h-4 accent-emerald-500" />
                  <span className="text-xs font-bold text-white">Tocar todos os moradores vinculados simultaneamente</span>
                </label>
              </div>
              <div className="pt-4">
                <button type="submit" className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-emerald-500/20">
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* PRINTABLE SHEET MODAL */}
      {printSheetData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <h3 className="text-sm font-black text-white">Folha Pronta para Impressão (Placard)</h3>
              <button onClick={() => setPrintSheetData(null)} className="text-slate-400 hover:text-white font-black text-lg">×</button>
            </div>
            <div id="printable-sheet" className="bg-white text-slate-950 p-8 rounded-2xl text-center space-y-4 border-4 border-slate-950 shadow-2xl">
              <div className="border-b-2 border-slate-900 pb-3">
                <h2 className="text-2xl font-black tracking-tight">{printSheetData.organizationName}</h2>
                <p className="text-xs text-slate-600 font-bold uppercase tracking-wider">{printSheetData.accessPointName}</p>
              </div>
              <div className="py-2">
                <img src={printSheetData.qrDataUrl} alt="QR Code" className="w-64 h-64 mx-auto border-2 border-slate-950 p-2 rounded-xl" />
              </div>
              <div className="bg-slate-100 p-4 rounded-xl border border-slate-300">
                <h4 className="text-sm font-black uppercase tracking-wider text-slate-900">{printSheetData.instructions}</h4>
                <p className="text-[11px] text-slate-600 mt-1">Não é necessário instalar nenhum aplicativo. Aponte a câmera e fale diretamente com o morador.</p>
              </div>
              <div className="text-[9px] text-slate-400 font-mono">Token: {printSheetData.token}</div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => window.print()} className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-2">
                <Printer className="w-4 h-4" /> Imprimir Folha A4
              </button>
              <button onClick={() => setPrintSheetData(null)} className="px-4 py-3 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ACCESS POINT MODAL */}
      {accessPointModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleCreateAccessPoint} className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-black text-white">Novo Ponto de Acesso</h3>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Nome do Ponto de Acesso</label>
              <input type="text" required placeholder="Ex: Portão de Veículos" value={newApName} onChange={e => setNewApName(e.target.value)} className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Descrição</label>
              <input type="text" placeholder="Ex: Entrada lateral" value={newApDesc} onChange={e => setNewApDesc(e.target.value)} className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white" />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs">Criar Acesso</button>
              <button type="button" onClick={() => setAccessPointModal(false)} className="px-4 py-2.5 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* PROPERTY MODAL */}
      {propertyModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveProperty} className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-black text-white">{propertyModal.mode === 'create' ? 'Nova Residência' : 'Editar Residência'}</h3>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Nome / Nomenclatura Dinâmica</label>
              <input type="text" required placeholder="Ex: Casa 7 / Apartamento 201" value={propertyModal.data.name} onChange={e => setPropertyModal({ ...propertyModal, data: { ...propertyModal.data, name: e.target.value } })} className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white font-bold" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Bloco / Setor</label>
              <input type="text" placeholder="Ex: Bloco A" value={propertyModal.data.block} onChange={e => setPropertyModal({ ...propertyModal, data: { ...propertyModal.data, block: e.target.value } })} className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Status</label>
              <select value={propertyModal.data.status} onChange={e => setPropertyModal({ ...propertyModal, data: { ...propertyModal.data, status: e.target.value } })} className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white font-bold">
                <option value="AVAILABLE">Disponível / Ativa</option>
                <option value="UNAVAILABLE">Indisponível</option>
                <option value="NO_RESIDENT">Sem Morador</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs">Salvar Residência</button>
              <button type="button" onClick={() => setPropertyModal(null)} className="px-4 py-2.5 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs">Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* RESIDENT MODAL */}
      {residentModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveResident} className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-black text-white">{residentModal.mode === 'create' ? 'Cadastrar Morador' : 'Editar Morador'}</h3>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Nome Completo</label>
              <input type="text" required placeholder="Ex: Carlos Silva" value={residentModal.data.name} onChange={e => setResidentModal({ ...residentModal, data: { ...residentModal.data, name: e.target.value } })} className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">E-mail</label>
              <input type="email" required placeholder="morador@interfone.com" value={residentModal.data.email} onChange={e => setResidentModal({ ...residentModal, data: { ...residentModal.data, email: e.target.value } })} className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Telefone</label>
              <input type="text" placeholder="(11) 99999-0000" value={residentModal.data.phone || ''} onChange={e => setResidentModal({ ...residentModal, data: { ...residentModal.data, phone: e.target.value } })} className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1">Vincular à Residência</label>
              <select value={residentModal.data.propertyIds?.[0] || ''} onChange={e => setResidentModal({ ...residentModal, data: { ...residentModal.data, propertyIds: [e.target.value] } })} className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white font-bold">
                <option value="">Selecione uma residência...</option>
                {properties.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.block})</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs">Salvar Morador</button>
              <button type="button" onClick={() => setResidentModal(null)} className="px-4 py-2.5 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs">Cancelar</button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
