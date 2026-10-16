const config = require('../config');

// In-memory rate limiting tracker for visitor calls
const callAttempts = new Map(); // key: IP or token -> { timestamps: [], blockedUntil: null }

function visitorRateLimiter(req, res, next) {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const key = `${clientIp}`;
  const now = Date.now();

  const record = callAttempts.get(key) || { timestamps: [], blockedUntil: null };

  // Check if currently blocked
  if (record.blockedUntil && now < record.blockedUntil) {
    const remainingSeconds = Math.ceil((record.blockedUntil - now) / 1000);
    return res.status(429).json({
      error: `Muitas tentativas de chamada. Por favor aguarde ${remainingSeconds} segundos antes de tentar novamente.`,
      retryAfter: remainingSeconds
    });
  }

  // Filter timestamps within window (e.g. 5 minutes)
  const windowMs = config.ANTI_SPAM.WINDOW_MINUTES * 60 * 1000;
  record.timestamps = record.timestamps.filter(ts => now - ts < windowMs);

  // Check minimum seconds between calls
  if (record.timestamps.length > 0) {
    const lastCall = record.timestamps[record.timestamps.length - 1];
    const minDiffMs = config.ANTI_SPAM.MIN_SECONDS_BETWEEN_CALLS * 1000;
    if (now - lastCall < minDiffMs) {
      const waitSec = Math.ceil((minDiffMs - (now - lastCall)) / 1000);
      return res.status(429).json({
        error: `Aguarde ${waitSec} segundos para iniciar outra chamada.`,
        retryAfter: waitSec
      });
    }
  }

  // Check max calls in window
  if (record.timestamps.length >= config.ANTI_SPAM.MAX_CALLS_PER_WINDOW) {
    const blockMs = config.ANTI_SPAM.BLOCK_DURATION_MINUTES * 60 * 1000;
    record.blockedUntil = now + blockMs;
    callAttempts.set(key, record);
    return res.status(429).json({
      error: `Limite de chamadas excedido. Bloqueado temporariamente por ${config.ANTI_SPAM.BLOCK_DURATION_MINUTES} minutos.`,
      retryAfter: config.ANTI_SPAM.BLOCK_DURATION_MINUTES * 60
    });
  }

  // Record this attempt
  record.timestamps.push(now);
  callAttempts.set(key, record);

  next();
}

function clearRateLimit(ipOrKey) {
  if (ipOrKey) {
    callAttempts.delete(ipOrKey);
  } else {
    callAttempts.clear();
  }
}

module.exports = {
  visitorRateLimiter,
  clearRateLimit
};
