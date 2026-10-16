const { v4: uuidv4 } = require('uuid');
const db = require('../database/db');

function logAction(organizationId, userId, action, ipAddress = '127.0.0.1', resourceId = null, details = '') {
  try {
    return db.insert('audit_logs', {
      id: `log-${uuidv4()}`,
      organizationId: organizationId || 'system',
      userId: userId || 'anonymous',
      action,
      ipAddress,
      resourceId,
      details: typeof details === 'object' ? JSON.stringify(details) : details,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[AUDIT] Failed to log action:', err.message);
  }
}

module.exports = {
  logAction
};
