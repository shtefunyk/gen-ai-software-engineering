const requests = new Map();
const LIMIT = 100;
const WINDOW_MS = 60 * 1000;

function rateLimiter(req, res, next) {
  if (process.env.NODE_ENV === 'test') return next();

  const ip = req.ip || req.socket.remoteAddress;
  const now = Date.now();
  const timestamps = (requests.get(ip) || []).filter(t => now - t < WINDOW_MS);

  if (timestamps.length >= LIMIT) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Limit: 100 requests per minute per IP',
    });
  }

  timestamps.push(now);
  requests.set(ip, timestamps);
  next();
}

module.exports = rateLimiter;
