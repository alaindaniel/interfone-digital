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

function camelToSnake(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase();
}

function snakeToCamel(str) {
  return str.replace(/(_[a-z])/g, group => group.toUpperCase().replace('_', ''));
}

function toSnakeCase(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const newObj = {};
  for (const [key, value] of Object.entries(obj)) {
    newObj[camelToSnake(key)] = value;
  }
  return newObj;
}

function toCamelCase(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const newObj = {};
  for (const [key, value] of Object.entries(obj)) {
    newObj[snakeToCamel(key)] = value;
  }
  return newObj;
}

module.exports = {
  supabase,
  isConfigured: () => Boolean(supabase),
  toSnakeCase,
  toCamelCase
};
