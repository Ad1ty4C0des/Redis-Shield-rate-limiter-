// Redis concepts: INCR, EXPIRE, MULTI/EXEC (Transactions)
const { redis } = require('../config/redis');

async function fixedWindow(identifier, {maxRequests, windowMs}) {
  const windowId = Math.floor(Date.now() / windowMs);
  const key = `rl:fw:${identifier}:${windowId}`;

  const pipeline = redis.multi();
  pipeline.incr(key);
  pipeline.pexpire(key, windowMs);
  const results = await pipeline.exec();

  const currentCount = results[0][1];

  if (currentCount <= maxRequests) {
    return {
      allowed: true,
      remaining: maxRequests - currentCount, 
      retryAfter: 0,
    };
  }

  const windowStart = windowId * windowMs;
  const windowEnd = windowStart + windowMs;
  const retryAfter = windowEnd - Date.now();

  return {
    allowed: false, 
    remaining: 0, 
    retryAfter: Math.max(0 , retryAfter),
  }
}

module.exports = {fixedWindow};