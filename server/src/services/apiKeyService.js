const { redis } = require('../config/redis');

const KEY_PREFIX = 'rl:keys:';

const DEFAULT_KEYS = {
  free_test_key: {
    role: 'user',
    plan: 'free',
    name: 'Free Tier Developer',
    description: 'Fixed window counter (standard tier)',
  },
  pro_test_key: {
    role: 'user',
    plan: 'pro',
    name: 'Pro Startup Client',
    description: 'Sliding window sorted set (mid tier)',
  },
  ent_test_key: {
    role: 'user',
    plan: 'enterprise',
    name: 'Enterprise VIP Partner',
    description: 'Token bucket algorithm (high throughput)',
  },
  adm_test_key: {
    role: 'admin',
    plan: 'enterprise',
    name: 'DevOps Master Admin',
    description: 'Full administrative rights to /api/admin/*',
  },
};

async function seedApiKeys() {
  for (const [key, data] of Object.entries(DEFAULT_KEYS)) {
    const redisKey = `${KEY_PREFIX}${key}`;
    const exists = await redis.exists(redisKey);
    if (!exists) {
      await redis.hset(redisKey, {
        ...data,
        createdAt: new Date().toISOString(),
      });
      console.log(`Seeded API key: ${key} (${data.name} - ${data.role})`);
    }
  }
}

async function getKeyData(apiKey) {
  if (!apiKey) return null;
  const redisKey = `${KEY_PREFIX}${apiKey}`;
  const data = await redis.hgetall(redisKey);

  // Self-healing: if key not found in Redis, restore from DEFAULT_KEYS
  if (!data || Object.keys(data).length === 0) {
    if (DEFAULT_KEYS[apiKey]) {
      const defaultData = DEFAULT_KEYS[apiKey];
      await redis.hset(redisKey, {
        ...defaultData,
        createdAt: new Date().toISOString(),
      });
      return {
        key: apiKey,
        role: defaultData.role || 'user',
        plan: defaultData.plan || 'free',
        name: defaultData.name || 'API Client',
        description: defaultData.description || '',
        createdAt: new Date().toISOString(),
      };
    }
    return null;
  }

  return {
    key: apiKey,
    role: data.role || 'user',
    plan: data.plan || 'free',
    name: data.name || 'API Client',
    description: data.description || '',
    createdAt: data.createdAt,
  };
}

async function getAllKeys() {
  const keys = [];
  for (const [key, defaultData] of Object.entries(DEFAULT_KEYS)) {
    const data = await getKeyData(key);
    keys.push(data || { key, ...defaultData });
  }
  return keys;
}

module.exports = { seedApiKeys, getKeyData, getAllKeys, DEFAULT_KEYS };
