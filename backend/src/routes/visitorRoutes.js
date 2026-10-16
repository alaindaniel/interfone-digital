const express = require('express');
const router = express.Router();
const db = require('../database/db');
const callManager = require('../services/callManager');
const { visitorRateLimiter } = require('../middleware/rateLimiter');

// Validate QR Code Token & Get Condo / Residence list
router.get('/access/:token', (req, res) => {
  const { token } = req.params;

  const qrRecord = db.findOne('qr_codes', { token });
  if (!qrRecord) {
    return res.status(404).json({ error: 'QR Code inválido ou não encontrado.' });
  }

  if (qrRecord.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'Este QR Code foi desativado pelo condomínio.' });
  }

  if (qrRecord.expiresAt && new Date(qrRecord.expiresAt) < new Date()) {
    return res.status(403).json({ error: 'Este QR Code expirou.' });
  }

  const accessPoint = db.findById('access_points', qrRecord.accessPointId);
  if (!accessPoint || accessPoint.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'Ponto de acesso desativado ou indisponível.' });
  }

  const organization = db.findById('organizations', qrRecord.organizationId);
  if (!organization || organization.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'Condomínio desativado ou em manutenção.' });
  }

  // Get active properties for this organization
  const allProperties = db.find('properties', { organizationId: organization.id });

  // Calculate real-time availability for each property
  const propertiesWithStatus = allProperties.map(prop => {
    // Find residents
    const rLinks = db.find('resident_properties', { propertyId: prop.id });
    const residentIds = rLinks.map(r => r.userId);
    const residents = db.find('users', u => residentIds.includes(u.id) && u.status === 'ACTIVE');

    let dynamicStatus = prop.status; // AVAILABLE, UNAVAILABLE, DND, NO_RESIDENT

    if (residents.length === 0) {
      dynamicStatus = 'NO_RESIDENT';
    } else {
      const allDND = residents.every(r => r.availability === 'DND');
      if (allDND) {
        dynamicStatus = 'DND';
      }
    }

    return {
      id: prop.id,
      name: prop.name,
      code: prop.code,
      block: prop.block,
      unitNumber: prop.unitNumber,
      status: dynamicStatus,
      isAvailable: dynamicStatus === 'AVAILABLE'
    };
  });

  // Settings
  const settings = db.findOne('settings', { organizationId: organization.id }) || {
    allowVideo: true,
    allowAudio: true,
    callTimeoutSeconds: 60
  };

  res.json({
    organization: {
      id: organization.id,
      name: organization.name,
      address: organization.address
    },
    accessPoint: {
      id: accessPoint.id,
      name: accessPoint.name,
      locationDescription: accessPoint.locationDescription
    },
    properties: propertiesWithStatus,
    settings: {
      allowVideo: settings.allowVideo,
      allowAudio: settings.allowAudio,
      callTimeoutSeconds: settings.callTimeoutSeconds
    }
  });
});

// Initiate call from visitor
router.post('/call', visitorRateLimiter, (req, res) => {
  const { token, propertyId, visitorName, withVideo, socketId } = req.body;

  if (!token || !propertyId || !visitorName || !visitorName.trim()) {
    return res.status(400).json({ error: 'Token, identificação da residência e nome do visitante são obrigatórios.' });
  }

  const qrRecord = db.findOne('qr_codes', { token, status: 'ACTIVE' });
  if (!qrRecord) {
    return res.status(403).json({ error: 'QR Code inválido ou inativo.' });
  }

  try {
    const result = callManager.createCall({
      organizationId: qrRecord.organizationId,
      accessPointId: qrRecord.accessPointId,
      propertyId,
      visitorName: visitorName.trim(),
      clientSocketId: socketId,
      withVideo: Boolean(withVideo),
      ipAddress: req.ip
    });

    res.json({
      success: true,
      call: result.call,
      property: result.property,
      timeoutSeconds: result.timeoutSeconds
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Check call status
router.get('/call/:callId', (req, res) => {
  const { callId } = req.params;
  const call = db.findById('calls', callId);
  if (!call) {
    return res.status(404).json({ error: 'Chamada não encontrada' });
  }

  const property = db.findById('properties', call.propertyId);
  let answeredByName = null;
  if (call.answeredByUserId) {
    const user = db.findById('users', call.answeredByUserId);
    if (user) answeredByName = user.name;
  }

  res.json({
    call,
    property,
    answeredByName
  });
});

// End call by visitor
router.post('/call/:callId/end', (req, res) => {
  const { callId } = req.params;
  const result = callManager.endCall(callId, 'VISITOR');
  res.json(result);
});

module.exports = router;
