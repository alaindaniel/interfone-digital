const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const db = require('../database/db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const auditService = require('../services/auditService');

router.use(authenticate);
router.use(requireAdmin);

// Dashboard KPI Stats
router.get('/dashboard/stats', (req, res) => {
  const orgId = req.user.organizationId;

  const properties = db.find('properties', { organizationId: orgId });
  const allUsers = db.find('users', { organizationId: orgId });
  const residents = allUsers.filter(u => u.role === 'RESIDENT');
  const qrCodes = db.find('qr_codes', { organizationId: orgId });
  const activeQRs = qrCodes.filter(q => q.status === 'ACTIVE');

  const allCalls = db.find('calls', { organizationId: orgId });
  const todayStr = new Date().toISOString().split('T')[0];
  const callsToday = allCalls.filter(c => c.startedAt && c.startedAt.startsWith(todayStr));

  const answeredToday = callsToday.filter(c => c.status === 'ENDED' || c.status === 'IN_PROGRESS');
  const missedToday = callsToday.filter(c => c.status === 'MISSED' || c.status === 'TIMEOUT');
  const inProgressCalls = allCalls.filter(c => c.status === 'IN_PROGRESS' || c.status === 'RINGING');

  // Chart data: hourly calls today
  const hourlyDistribution = Array(24).fill(0);
  for (const c of callsToday) {
    if (c.startedAt) {
      const hour = new Date(c.startedAt).getHours();
      hourlyDistribution[hour]++;
    }
  }

  res.json({
    kpi: {
      totalProperties: properties.length,
      totalResidents: residents.length,
      callsToday: callsToday.length,
      answeredToday: answeredToday.length,
      missedToday: missedToday.length,
      inProgressCalls: inProgressCalls.length,
      activeQRCodes: activeQRs.length
    },
    charts: {
      hourlyDistribution,
      statusBreakdown: {
        answered: allCalls.filter(c => c.status === 'ENDED').length,
        missed: allCalls.filter(c => c.status === 'MISSED' || c.status === 'TIMEOUT').length,
        declined: allCalls.filter(c => c.status === 'DECLINED').length
      }
    }
  });
});

// === ORGANIZATIONS ===
router.get('/organizations', (req, res) => {
  const orgs = db.find('organizations');
  res.json({ organizations: orgs });
});

router.put('/organizations/:id', (req, res) => {
  const { name, address, status } = req.body;
  const updated = db.update('organizations', req.params.id, { name, address, status });
  auditService.logAction(req.params.id, req.user.id, 'ORGANIZATION_UPDATED', req.ip, req.params.id, { name });
  res.json({ organization: updated });
});

// === ACCESS POINTS ===
router.get('/access-points', (req, res) => {
  const orgId = req.user.organizationId;
  const accessPoints = db.find('access_points', { organizationId: orgId });
  res.json({ accessPoints });
});

router.post('/access-points', (req, res) => {
  const orgId = req.user.organizationId;
  const { name, locationDescription } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome do acesso é obrigatório' });

  const ap = db.insert('access_points', {
    id: `acc-${uuidv4()}`,
    organizationId: orgId,
    name,
    locationDescription: locationDescription || '',
    status: 'ACTIVE'
  });

  // Auto-generate QR code for this access point
  const token = `qr-${uuidv4()}`;
  db.insert('qr_codes', {
    id: `qr-${uuidv4()}`,
    accessPointId: ap.id,
    organizationId: orgId,
    token,
    status: 'ACTIVE',
    expiresAt: null
  });

  auditService.logAction(orgId, req.user.id, 'ACCESS_POINT_CREATED', req.ip, ap.id, { name });
  res.json({ accessPoint: ap });
});

router.put('/access-points/:id', (req, res) => {
  const { name, locationDescription, status } = req.body;
  const updated = db.update('access_points', req.params.id, { name, locationDescription, status });
  auditService.logAction(req.user.organizationId, req.user.id, 'ACCESS_POINT_UPDATED', req.ip, req.params.id, { name, status });
  res.json({ accessPoint: updated });
});

router.delete('/access-points/:id', (req, res) => {
  db.delete('access_points', req.params.id);
  db.deleteWhere('qr_codes', q => q.accessPointId === req.params.id);
  auditService.logAction(req.user.organizationId, req.user.id, 'ACCESS_POINT_DELETED', req.ip, req.params.id);
  res.json({ success: true });
});

// === PROPERTIES (RESIDÊNCIAS) ===
router.get('/properties', (req, res) => {
  const orgId = req.user.organizationId;
  const properties = db.find('properties', { organizationId: orgId });

  // Attach residents
  const enriched = properties.map(p => {
    const rLinks = db.find('resident_properties', { propertyId: p.id });
    const rIds = rLinks.map(l => l.userId);
    const residents = db.find('users', u => rIds.includes(u.id)).map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      availability: u.availability || 'AVAILABLE',
      status: u.status
    }));

    return {
      ...p,
      residents
    };
  });

  res.json({ properties: enriched });
});

router.post('/properties', (req, res) => {
  const orgId = req.user.organizationId;
  const { name, code, block, unitNumber, status = 'AVAILABLE', residentIds = [] } = req.body;

  if (!name) return res.status(400).json({ error: 'Nome da residência é obrigatório' });

  const prop = db.insert('properties', {
    id: `prop-${uuidv4()}`,
    organizationId: orgId,
    name,
    code: code || name.toUpperCase().replace(/\s+/g, ''),
    block: block || 'Geral',
    unitNumber: unitNumber || '',
    status
  });

  // Link residents
  for (const rId of residentIds) {
    db.insert('resident_properties', {
      id: `rp-${uuidv4()}`,
      userId: rId,
      propertyId: prop.id,
      isPrimary: false
    });
  }

  auditService.logAction(orgId, req.user.id, 'PROPERTY_CREATED', req.ip, prop.id, { name, block });
  res.json({ property: prop });
});

router.put('/properties/:id', (req, res) => {
  const { name, code, block, unitNumber, status, residentIds } = req.body;
  const updated = db.update('properties', req.params.id, {
    name,
    code,
    block,
    unitNumber,
    status
  });

  if (Array.isArray(residentIds)) {
    // Replace links
    db.deleteWhere('resident_properties', rp => rp.propertyId === req.params.id);
    for (const rId of residentIds) {
      db.insert('resident_properties', {
        id: `rp-${uuidv4()}`,
        userId: rId,
        propertyId: req.params.id,
        isPrimary: false
      });
    }
  }

  auditService.logAction(req.user.organizationId, req.user.id, 'PROPERTY_UPDATED', req.ip, req.params.id, { name, status });
  res.json({ property: updated });
});

router.delete('/properties/:id', (req, res) => {
  db.delete('properties', req.params.id);
  db.deleteWhere('resident_properties', rp => rp.propertyId === req.params.id);
  auditService.logAction(req.user.organizationId, req.user.id, 'PROPERTY_DELETED', req.ip, req.params.id);
  res.json({ success: true });
});

// === RESIDENTS (MORADORES) ===
router.get('/residents', (req, res) => {
  const orgId = req.user.organizationId;
  const residents = db.find('users', u => u.organizationId === orgId && u.role === 'RESIDENT');

  const enriched = residents.map(r => {
    const rLinks = db.find('resident_properties', { userId: r.id });
    const pIds = rLinks.map(l => l.propertyId);
    const properties = db.find('properties', p => pIds.includes(p.id));

    const { passwordHash, ...safe } = r;
    return {
      ...safe,
      properties
    };
  });

  res.json({ residents: enriched });
});

router.post('/residents', (req, res) => {
  const orgId = req.user.organizationId;
  const { name, email, phone, password = 'morador123', propertyIds = [] } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Nome e email são obrigatórios' });
  }

  const existing = db.findOne('users', { email: email.toLowerCase().trim() });
  if (existing) {
    return res.status(400).json({ error: 'Já existe um usuário cadastrado com este email' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const resident = db.insert('users', {
    id: `usr-${uuidv4()}`,
    organizationId: orgId,
    name,
    email: email.toLowerCase().trim(),
    phone: phone || '',
    passwordHash,
    role: 'RESIDENT',
    status: 'ACTIVE',
    availability: 'AVAILABLE'
  });

  for (const pId of propertyIds) {
    db.insert('resident_properties', {
      id: `rp-${uuidv4()}`,
      userId: resident.id,
      propertyId: pId,
      isPrimary: true
    });
  }

  auditService.logAction(orgId, req.user.id, 'RESIDENT_CREATED', req.ip, resident.id, { name, email });

  const { passwordHash: _, ...safeResident } = resident;
  res.json({ resident: safeResident });
});

router.put('/residents/:id', (req, res) => {
  const { name, phone, password, status, availability, propertyIds } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (status !== undefined) updates.status = status;
  if (availability !== undefined) updates.availability = availability;
  if (password) updates.passwordHash = bcrypt.hashSync(password, 10);

  const updated = db.update('users', req.params.id, updates);

  if (Array.isArray(propertyIds)) {
    db.deleteWhere('resident_properties', rp => rp.userId === req.params.id);
    for (const pId of propertyIds) {
      db.insert('resident_properties', {
        id: `rp-${uuidv4()}`,
        userId: req.params.id,
        propertyId: pId,
        isPrimary: true
      });
    }
  }

  auditService.logAction(req.user.organizationId, req.user.id, 'RESIDENT_UPDATED', req.ip, req.params.id, { name, status });
  const { passwordHash: _, ...safeResident } = updated;
  res.json({ resident: safeResident });
});

router.delete('/residents/:id', (req, res) => {
  db.delete('users', req.params.id);
  db.deleteWhere('resident_properties', rp => rp.userId === req.params.id);
  db.deleteWhere('devices', d => d.userId === req.params.id);
  auditService.logAction(req.user.organizationId, req.user.id, 'RESIDENT_DELETED', req.ip, req.params.id);
  res.json({ success: true });
});

// === QR CODES ===
router.get('/qrcodes', (req, res) => {
  const orgId = req.user.organizationId;
  const qrCodes = db.find('qr_codes', { organizationId: orgId });

  const enriched = qrCodes.map(q => {
    const ap = db.findById('access_points', q.accessPointId);
    return {
      ...q,
      accessPointName: ap ? ap.name : 'Acesso Desconhecido',
      locationDescription: ap ? ap.locationDescription : ''
    };
  });

  res.json({ qrCodes: enriched });
});

router.post('/qrcodes/generate', (req, res) => {
  const orgId = req.user.organizationId;
  const { accessPointId, expiresAt = null } = req.body;

  if (!accessPointId) return res.status(400).json({ error: 'Ponto de acesso é obrigatório' });

  const token = `qr-${uuidv4()}`;
  const qr = db.insert('qr_codes', {
    id: `qr-${uuidv4()}`,
    accessPointId,
    organizationId: orgId,
    token,
    status: 'ACTIVE',
    expiresAt
  });

  auditService.logAction(orgId, req.user.id, 'QRCODE_GENERATED', req.ip, qr.id, { token });
  res.json({ qrCode: qr });
});

router.post('/qrcodes/:id/regenerate', (req, res) => {
  const newToken = `qr-${uuidv4()}`;
  const updated = db.update('qr_codes', req.params.id, {
    token: newToken,
    status: 'ACTIVE'
  });

  auditService.logAction(req.user.organizationId, req.user.id, 'QRCODE_REGENERATED', req.ip, req.params.id, { newToken });
  res.json({ qrCode: updated });
});

router.post('/qrcodes/:id/toggle-status', (req, res) => {
  const existing = db.findById('qr_codes', req.params.id);
  if (!existing) return res.status(404).json({ error: 'QR Code não encontrado' });

  const newStatus = existing.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
  const updated = db.update('qr_codes', req.params.id, { status: newStatus });

  auditService.logAction(req.user.organizationId, req.user.id, 'QRCODE_STATUS_TOGGLED', req.ip, req.params.id, { newStatus });
  res.json({ qrCode: updated });
});

// QR Code PNG Stream
router.get('/qrcodes/:id/png', async (req, res) => {
  const qr = db.findById('qr_codes', req.params.id);
  if (!qr) return res.status(404).send('QR Code não encontrado');

  const host = req.get('host');
  const protocol = req.protocol;
  const visitorUrl = `${protocol}://${host}/v/${qr.token}`;

  try {
    res.setHeader('Content-Type', 'image/png');
    await QRCode.toFileStream(res, visitorUrl, {
      width: 512,
      margin: 2,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      }
    });
  } catch (err) {
    res.status(500).send('Erro ao gerar PNG do QR Code');
  }
});

// Printable Placard Data
router.get('/qrcodes/:id/print-sheet', async (req, res) => {
  const qr = db.findById('qr_codes', req.params.id);
  if (!qr) return res.status(404).json({ error: 'QR Code não encontrado' });

  const org = db.findById('organizations', qr.organizationId);
  const ap = db.findById('access_points', qr.accessPointId);

  const host = req.get('host');
  const protocol = req.protocol;
  const visitorUrl = `${protocol}://${host}/v/${qr.token}`;
  const qrDataUrl = await QRCode.toDataURL(visitorUrl, { width: 400, margin: 2 });

  res.json({
    organizationName: org ? org.name : 'Condomínio',
    organizationAddress: org ? org.address : '',
    accessPointName: ap ? ap.name : 'Entrada',
    token: qr.token,
    qrDataUrl,
    visitorUrl,
    instructions: 'APONTE A CÂMERA DO CELULAR PARA O QR CODE PARA CHAMAR'
  });
});

// === CALL MONITOR & HISTORY ===
router.get('/calls', (req, res) => {
  const orgId = req.user.organizationId;
  const { status, filter, propertyId } = req.query;

  let calls = db.find('calls', { organizationId: orgId });

  if (propertyId) {
    calls = calls.filter(c => c.propertyId === propertyId);
  }

  if (status && status !== 'ALL') {
    calls = calls.filter(c => c.status === status);
  }

  const now = new Date();
  if (filter === 'today') {
    const todayStr = now.toISOString().split('T')[0];
    calls = calls.filter(c => c.startedAt && c.startedAt.startsWith(todayStr));
  } else if (filter === 'yesterday') {
    const yestStr = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    calls = calls.filter(c => c.startedAt && c.startedAt.startsWith(yestStr));
  } else if (filter === '7days') {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    calls = calls.filter(c => c.startedAt && new Date(c.startedAt) >= sevenDaysAgo);
  }

  const enriched = calls.map(c => {
    const prop = db.findById('properties', c.propertyId);
    const ap = db.findById('access_points', c.accessPointId);
    let answeredByName = null;
    if (c.answeredByUserId) {
      const u = db.findById('users', c.answeredByUserId);
      if (u) answeredByName = u.name;
    }
    return {
      ...c,
      propertyName: prop ? prop.name : 'Residência',
      accessPointName: ap ? ap.name : 'Entrada',
      answeredByName
    };
  });

  enriched.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  res.json({ calls: enriched });
});

// === AUDIT LOGS ===
router.get('/audit-logs', (req, res) => {
  const orgId = req.user.organizationId;
  const logs = db.find('audit_logs', { organizationId: orgId });

  const enriched = logs.map(l => {
    let userName = 'Sistema / Anônimo';
    if (l.userId && l.userId !== 'anonymous') {
      const u = db.findById('users', l.userId);
      if (u) userName = u.name;
    }
    return {
      ...l,
      userName
    };
  });

  enriched.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ logs: enriched.slice(0, 100) });
});

// === SETTINGS ===
router.get('/settings', (req, res) => {
  const orgId = req.user.organizationId;
  let settings = db.findOne('settings', { organizationId: orgId });
  if (!settings) {
    settings = db.insert('settings', {
      id: `set-${uuidv4()}`,
      organizationId: orgId,
      callTimeoutSeconds: 60,
      allowVideo: true,
      allowAudio: true,
      allowMultiResidentRinging: true,
      maxSimultaneousCalls: 10,
      maintenanceMode: false,
      unavailabilityMessage: 'No momento os moradores desta residência não estão disponíveis.'
    });
  }
  res.json({ settings });
});

router.put('/settings', (req, res) => {
  const orgId = req.user.organizationId;
  const existing = db.findOne('settings', { organizationId: orgId });
  if (!existing) return res.status(404).json({ error: 'Configurações não encontradas' });

  const {
    callTimeoutSeconds,
    allowVideo,
    allowAudio,
    allowMultiResidentRinging,
    maxSimultaneousCalls,
    maintenanceMode,
    unavailabilityMessage
  } = req.body;

  const updated = db.update('settings', existing.id, {
    callTimeoutSeconds: Number(callTimeoutSeconds) || 60,
    allowVideo: Boolean(allowVideo),
    allowAudio: Boolean(allowAudio),
    allowMultiResidentRinging: Boolean(allowMultiResidentRinging),
    maxSimultaneousCalls: Number(maxSimultaneousCalls) || 10,
    maintenanceMode: Boolean(maintenanceMode),
    unavailabilityMessage: unavailabilityMessage || ''
  });

  auditService.logAction(orgId, req.user.id, 'SETTINGS_UPDATED', req.ip, existing.id, req.body);
  res.json({ settings: updated });
});

module.exports = router;
