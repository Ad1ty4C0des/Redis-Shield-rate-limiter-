// Redis concepts: XADD, XREVRANGE, XREADGROUP, XACK, Consumer Groups
const { redis } = require('../config/redis');

const STREAM_KEY = 'rl:stream:blocked';
const MAX_STREAM_LEN = 10000;
const MAX_FIELD_LEN = 200;
const MAX_READ = 500;

let lastErrorLog = 0;
function logError(msg, err) {
  const now = Date.now();
  if (now - lastErrorLog > 10000) {
    lastErrorLog = now;
    console.error(`${msg}:`, err.message);
  }
}

const clean = (v) => String(v ?? 'unknown').slice(0, MAX_FIELD_LEN);

async function logBlockedRequest({ ip, clientKey, identifier, endpoint, algorithm }) {
  const path = clean(endpoint).split('?')[0];

  return redis
    .xadd(
      STREAM_KEY,
      'MAXLEN', '~', MAX_STREAM_LEN,
      '*',
      'ip', clean(ip),
      'clientKey', clean(clientKey || identifier),
      'endpoint', path,
      'algorithm', clean(algorithm),
    )
    .catch((err) => {
      logError('Stream log error', err);
      return null;
    });
}

async function getRecentBlocked({ count = 50, before } = {}) {
  try {
    const limit = Math.min(Math.max(parseInt(count, 10) || 50, 1), MAX_READ);
    const end = before ? `(${before}` : '+';

    const entries = await redis.xrevrange(STREAM_KEY, end, '-', 'COUNT', limit);

    const items = entries.map(([id, fields]) => {
      const data = { id, blockedAt: new Date(parseInt(id.split('-')[0], 10)).toISOString() };

      for (let i = 0; i < fields.length; i += 2) {
        data[fields[i]] = fields[i + 1];
      }

      return data;
    });

    return {
      items,
      nextCursor: items.length === limit ? items[items.length - 1].id : null,
    };
  } catch (err) {
    logError('Stream read error', err);
    return { items: [], nextCursor: null };
  }
}

module.exports = { logBlockedRequest, getRecentBlocked };
