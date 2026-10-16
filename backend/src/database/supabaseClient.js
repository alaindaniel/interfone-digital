const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

let supabase = null;

if (config.SUPABASE_URL && config.SUPABASE_KEY) {
  supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY, {
    auth: { persistSession: false }
  });
  console.log('[SUPABASE] Cliente Supabase inicializado com sucesso.');
} else {
  console.log('[SUPABASE] SUPABASE_URL ou SUPABASE_KEY não configurados. Usando armazenamento local em database.json.');
}

const TABLE_COLUMNS = {
  organizations: ['id', 'name', 'slug', 'address', 'status', 'created_at', 'updated_at'],
  settings: ['id', 'organization_id', 'call_timeout_seconds', 'allow_video', 'allow_audio', 'allow_multi_resident_ringing', 'max_simultaneous_calls', 'maintenance_mode', 'unavailability_message', 'created_at', 'updated_at'],
  access_points: ['id', 'organization_id', 'name', 'location_description', 'status', 'created_at', 'updated_at'],
  qr_codes: ['id', 'access_point_id', 'organization_id', 'token', 'status', 'expires_at', 'created_at', 'updated_at'],
  properties: ['id', 'organization_id', 'name', 'code', 'block', 'unit_number', 'status', 'created_at', 'updated_at'],
  users: ['id', 'organization_id', 'name', 'email', 'phone', 'password_hash', 'role', 'status', 'availability', 'created_at', 'updated_at'],
  resident_properties: ['id', 'user_id', 'property_id', 'is_primary', 'created_at', 'updated_at'],
  devices: ['id', 'user_id', 'fcm_token', 'platform', 'last_seen_at', 'created_at', 'updated_at'],
  calls: ['id', 'organization_id', 'access_point_id', 'property_id', 'visitor_name', 'with_video', 'status', 'started_at', 'answered_at', 'ended_at', 'duration_seconds', 'end_reason', 'ip_address', 'created_at', 'updated_at'],
  call_participants: ['id', 'call_id', 'user_id', 'role', 'status', 'created_at', 'updated_at'],
  audit_logs: ['id', 'organization_id', 'action', 'details', 'user_id', 'created_at', 'updated_at']
};

function camelToSnake(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function snakeToCamel(str) {
  return str.replace(/(_[a-z])/g, group => group.toUpperCase().replace('_', ''));
}

function toSnakeCase(obj, table = null) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const raw = {};
  for (const [key, value] of Object.entries(obj)) {
    raw[camelToSnake(key)] = value;
  }

  if (table === 'devices' && raw.token && !raw.fcm_token) {
    raw.fcm_token = raw.token;
  }

  if (table === 'audit_logs') {
    if (typeof raw.details === 'string') {
      try {
        raw.details = JSON.parse(raw.details);
      } catch (e) {
        raw.details = { message: raw.details, ip: raw.ip_address, resourceId: raw.resource_id };
      }
    }
    if (raw.user_id && !raw.user_id.startsWith('usr-')) {
      raw.user_id = null;
    }
  }

  if (table && TABLE_COLUMNS[table]) {
    const allowed = new Set(TABLE_COLUMNS[table]);
    const filtered = {};
    for (const [k, v] of Object.entries(raw)) {
      if (allowed.has(k)) {
        filtered[k] = v;
      }
    }
    return filtered;
  }

  return raw;
}

function toCamelCase(obj, table = null) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const newObj = {};
  for (const [key, value] of Object.entries(obj)) {
    newObj[snakeToCamel(key)] = value;
  }
  if (table === 'devices' && newObj.fcmToken && !newObj.token) {
    newObj.token = newObj.fcmToken;
  }
  if (table === 'audit_logs' && newObj.details && typeof newObj.details === 'object') {
    newObj.details = newObj.details.message || JSON.stringify(newObj.details);
  }
  return newObj;
}

module.exports = {
  supabase,
  isConfigured: () => Boolean(supabase),
  toSnakeCase,
  toCamelCase
};
