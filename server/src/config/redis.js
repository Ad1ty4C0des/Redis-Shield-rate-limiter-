const Redis = require('ioredis');

const commonOptions = {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    console.log(`⏳ Redis reconnecting in ${delay}ms (attempt ${times})`);
    return delay;
  },
};

let redis;
let subscriber;

const redisUrl = process.env.REDIS_URL;

if (redisUrl) {
  // Support Cloud Redis connection strings (e.g., Upstash rediss://, Railway, Render, Redis Cloud)
  const isTls = redisUrl.startsWith('rediss://');
  const tlsOptions = isTls ? { tls: { rejectUnauthorized: false } } : {};
  redis = new Redis(redisUrl, { ...commonOptions, ...tlsOptions });
  subscriber = new Redis(redisUrl, { ...commonOptions, ...tlsOptions });
} else {
  // Support host/port parameters for local / container environments
  const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    ...commonOptions,
  };
  redis = new Redis(redisConfig);
  subscriber = new Redis(redisConfig);
}

redis.on('connect', () => console.log('✅ Redis main client connected'));
redis.on('error', (err) => console.error('❌ Redis main client error:', err.message));

subscriber.on('connect', () => console.log('✅ Redis subscriber client connected'));
subscriber.on('error', (err) => console.error('❌ Redis subscriber error:', err.message));

module.exports = { redis, subscriber };
