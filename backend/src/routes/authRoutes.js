const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../database/db');
const { authenticate } = require('../middleware/auth');
const auditService = require('../services/auditService');

// Login endpoint
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  const user = db.findOne('users', { email: email.toLowerCase().trim() });
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  if (user.status === 'BLOCKED') {
    return res.status(403).json({ error: 'Usuário bloqueado pelo administrador' });
  }

  const passwordMatch = bcrypt.compareSync(password, user.passwordHash);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id, role: user.role, organizationId: user.organizationId },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );

  // Get user properties
  const residentProps = db.find('resident_properties', { userId: user.id });
  const propIds = residentProps.map(rp => rp.propertyId);
  const properties = db.find('properties', p => propIds.includes(p.id));
  const organization = db.findById('organizations', user.organizationId);

  auditService.logAction(user.organizationId, user.id, 'USER_LOGIN', req.ip, user.id, {
    role: user.role,
    email: user.email
  });

  const { passwordHash, ...safeUser } = user;
  res.json({
    token,
    user: safeUser,
    organization,
    properties
  });
});

// Current user profile
router.get('/me', authenticate, (req, res) => {
  const user = req.user;
  const residentProps = db.find('resident_properties', { userId: user.id });
  const propIds = residentProps.map(rp => rp.propertyId);
  const properties = db.find('properties', p => propIds.includes(p.id));
  const organization = db.findById('organizations', user.organizationId);

  const { passwordHash, ...safeUser } = user;
  res.json({
    user: safeUser,
    organization,
    properties
  });
});

// Demo accounts for rapid testing & switching
router.get('/demo-accounts', (req, res) => {
  const users = db.find('users');
  const demoList = users.map(u => {
    const rps = db.find('resident_properties', { userId: u.id });
    const props = db.find('properties', p => rps.some(rp => rp.propertyId === p.id));
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      availability: u.availability || 'AVAILABLE',
      properties: props.map(p => ({ id: p.id, name: p.name, block: p.block }))
    };
  });

  res.json({ accounts: demoList });
});

module.exports = router;
