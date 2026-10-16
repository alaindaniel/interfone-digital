const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../database/db');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    const user = db.findById('users', decoded.userId);
    if (!user || user.status === 'BLOCKED') {
      return res.status(403).json({ error: 'Usuário desativado ou inválido' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
}

function requireResident(req, res, next) {
  if (!req.user || (req.user.role !== 'RESIDENT' && req.user.role !== 'ADMIN')) {
    return res.status(403).json({ error: 'Acesso restrito a moradores' });
  }
  next();
}

module.exports = {
  authenticate,
  requireAdmin,
  requireResident
};
