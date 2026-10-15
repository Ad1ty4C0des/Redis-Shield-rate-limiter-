// Redis concepts: Hashes (HMGET/HMSET), Lua Scripting, EXPIRE
const fs = require('fs');
const path = require('path');
const { redis } = require('../config/redis');

const luaScript = fs.readFileSync(path.join(__dirname, '..', 'lua', 'tokenBucket.lua'), 'utf-8');

redis.defineCommand('tokenBucketCheck', {
  numberOfKeys: 1,
  lua: luaScript,
});

async function tokenBucket(identifier, {maxTokens, refillRate, ttlSec}) {
  const key = `rl:tb:${identifier}`;
  const now = Date.now();

  const [allowed, remaining, retryAfter] = await redis.tokenBucketCheck(
    key, 
    now, 
    maxTokens,
    refillRate,
    ttlSec,
  );

  return {
    allowed: allowed === 1,
    remaining: Number(remaining),
    retryAfter: Number(retryAfter),
  };
}

module.exports = { tokenBucket };