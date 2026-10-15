const { fixedWindow } = require('../algorithms/fixedWindow');
const { slidingWindow } = require('../algorithms/slidingWindow');
const { tokenBucket } = require('../algorithms/tokenBucket');
const { logBlockedRequest } = require('../services/streamLogger');
const { publishBlockedEvent } = require('../services/eventPublisher');
const { recordBlock, recordRequest } = require('../services/analytics');
const { getPlan } = require('../services/planConfig');

function rateLimiter(options = {}) {
  return async (req, res, next) => {
    const clientPlanName = req.user?.plan || 'free';
    const planConfig = (await getPlan(clientPlanName)) || {
      maxRequests: 5,
      windowMs: 60000,
      algorithm: 'fixed',
    };

    const algorithm = options.algorithm || planConfig.algorithm || 'fixed';

    const maxRequests = planConfig.maxRequests || options.maxRequests || 5;
    const windowMs = planConfig.windowMs || options.windowMs || 60000;

    const maxTokens = planConfig.maxRequests || options.maxTokens || 10;
    const refillRate = clientPlanName === 'enterprise' ? 20 : (clientPlanName === 'pro' ? 5 : (options.refillRate || 1));
    const ttlSec = options.ttlSec || 60;

    const identifier = req.user?.id || req.ip;
    const startHr = process.hrtime.bigint();

    let result;
    if (algorithm === 'sliding') {
      result = await slidingWindow(identifier, { maxRequests, windowMs });
    } else if (algorithm === 'token') {
      result = await tokenBucket(identifier, { maxTokens, refillRate, ttlSec });
    } else {
      result = await fixedWindow(identifier, { maxRequests, windowMs });
    }

    const endHr = process.hrtime.bigint();
    const latencyMs = Number(endHr - startHr) / 1e6;
    const effectiveLimit = algorithm === 'token' ? maxTokens : maxRequests;
    const effectiveRemaining = Math.max(0, Number(result.remaining));

    req.rateLimit = {
      limit: effectiveLimit,
      remaining: effectiveRemaining,
      allowed: result.allowed,
      algorithm,
      latencyMs: Number(latencyMs.toFixed(3)),
    };

    res.set({
      'X-Client-Role': req.user?.role || 'user',
      'X-Client-Plan': clientPlanName,
      'X-Client-Key': req.user?.key || 'anonymous',
      'X-RateLimit-Limit': String(effectiveLimit),
      'X-RateLimit-Remaining': String(effectiveRemaining),
      'X-RateLimit-Latency-Ms': latencyMs.toFixed(3),
      'X-Redis-Algorithm': algorithm === 'sliding' ? 'sliding_window_zset' : algorithm === 'token' ? 'token_bucket_hash' : 'fixed_window_counter',
    });

    recordRequest({
      ip: identifier,
      endpoint: req.originalUrl,
      allowed: result.allowed,
      latencyMs,
    });

    if (result.allowed) {
      return next();
    }

    res.set('Retry-After', Math.ceil(result.retryAfter / 1000));
    logBlockedRequest({ ip: identifier, endpoint: req.originalUrl, algorithm });
    publishBlockedEvent({ ip: identifier, endpoint: req.originalUrl, algorithm });
    recordBlock({ ip: identifier, endpoint: req.originalUrl });

    return res.status(429).json({
      error: 'too many requests',
      retryAfter: result.retryAfter,
      plan: clientPlanName,
      quota: effectiveLimit,
      remaining: 0,
      role: req.user?.role || 'user',
    });
  };
}

module.exports = { rateLimiter };
