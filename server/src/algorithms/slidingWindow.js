// Redis concepts: Sorted Sets (ZADD, ZREMRANGEBYSCORE, ZCARD), Lua Scripting
const fs = require('fs');
const path = require('path');
const { redis } = require('../config/redis');

const luaScript = fs.readFileSync(path.join(__dirname, '..', 'lua', 'slidingWindow.lua'), 'utf-8' );

redis.defineCommand('slidingWindowCheck', {
  numberOfKeys: 1,
  lua: luaScript,
});

async function slidingWindow(identifier, { maxRequests, windowMs }) {
  const key = `rl:sw:${identifier}`;
  const now = Date.now();

  const [allowed, remaining, retryAfter] = await redis.slidingWindowCheck(
    key,
    now,
    windowMs,
    maxRequests
  );

  return {
    allowed: allowed === 1,
    remaining: Number(remaining),
    retryAfter: Number(retryAfter),
  };
}

module.exports = { slidingWindow };