const path = require('path');
require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 4000,
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_KEY: process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '',
  // Path to the Firebase service-account JSON. Keep this outside source control.
  FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
  JWT_SECRET: process.env.JWT_SECRET || 'interfone_digital_jwt_secret_key_2026_secure',
  JWT_EXPIRES_IN: '7d',
  DB_PATH: path.join(__dirname, '../../data/database.json'),
  DEFAULT_CALL_TIMEOUT_SECONDS: 60,
  ANTI_SPAM: {
    MAX_CALLS_PER_WINDOW: 5,
    WINDOW_MINUTES: 5,
    MIN_SECONDS_BETWEEN_CALLS: 10,
    BLOCK_DURATION_MINUTES: 10
  },
  CORS_ORIGIN: '*'
};
