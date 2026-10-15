// Redis concepts: HSET, HGETALL, HGET (structured key-value storage)
const { redis } = require('../config/redis');

const PLAN_PREFIX = 'rl:plan:';
const ALLOWED_ALGORITHMS = ['fixed', 'sliding', 'token'];

const DEFAULT_PLANS = {
  free: {
    maxRequests: 5,
    windowMs: 60000,
    algorithm: 'fixed',
  },
  pro: {
    maxRequests: 20,
    windowMs: 60000,
    algorithm: 'sliding',
  },
  enterprise: {
    maxRequests: 100,
    windowMs: 60000,
    algorithm: 'token',
  }
};

async function seedPlans() {
  for (const [planName, config] of Object.entries(DEFAULT_PLANS)) {
    const key = `${PLAN_PREFIX}${planName}`;
    const exists = await redis.exists(key);
    if (!exists) {
      await redis.hset(key, config);
      console.log(`Seeded plan: ${planName}`);
    }
  }
}

async function getPlan(planName) {
  const key = `${PLAN_PREFIX}${planName}`;
  const plan = await redis.hgetall(key);

  // Self-healing: if plan deleted, restore from DEFAULT_PLANS
  if (!plan || Object.keys(plan).length === 0) {
    if (DEFAULT_PLANS[planName]) {
      const defaultConfig = DEFAULT_PLANS[planName];
      await redis.hset(key, defaultConfig);
      return {
        name: planName,
        maxRequests: Number(defaultConfig.maxRequests),
        windowMs: Number(defaultConfig.windowMs),
        algorithm: defaultConfig.algorithm,
      };
    }
    return null;
  } 

  return {
    name: planName,
    maxRequests: Number(plan.maxRequests),
    windowMs: Number(plan.windowMs),
    algorithm: plan.algorithm,
  };
}

async function updatePlan(planName, updates) {
  const current = await getPlan(planName);
  if (!current) return null;
  if (Object.keys(updates).length === 0) return current;

  if (updates.maxRequests !== undefined && !(Number(updates.maxRequests) > 0)) {
    throw new Error('maxRequests must be a positive number');
  }
  if (updates.windowMs !== undefined && !(Number(updates.windowMs) > 0)) {
    throw new Error('windowMs must be a positive number');
  }
  if (updates.algorithm !== undefined && !ALLOWED_ALGORITHMS.includes(updates.algorithm)) {
    throw new Error(`algorithm must be one of: ${ALLOWED_ALGORITHMS.join(', ')}`);
  }

  await redis.hset(`${PLAN_PREFIX}${planName}`, updates);
  return getPlan(planName);
}

async function getAllPlans() {
  const plans = {};
  for (const planName of Object.keys(DEFAULT_PLANS)) {
    plans[planName] = await getPlan(planName);
  }
  return plans;
}

module.exports = { seedPlans, getPlan, updatePlan, getAllPlans };
