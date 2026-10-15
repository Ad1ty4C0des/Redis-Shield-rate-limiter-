// Redis concepts: LPUSH, BRPOP (blocking queue pattern)
const { redis } = require('../config/redis');
const QUEUE_KEY = 'rl:queue:jobs';

const workerClient = redis.duplicate();

let isRunning = false;

async function enqueueJob(type, payload) {
  const job = JSON.stringify({
    type, 
    payload,
    enqueuedAt: Date.now(),
  });
  await redis.lpush(QUEUE_KEY, job);
  console.log(`📥 Enqueued job: ${type}`);
}

async function deleteKeysByPattern(pattern) {
  let deleted = 0;
  const stream = redis.scanStream({ match: pattern, count: 100 });

  for await (const keys of stream) {
    if (keys.length > 0) {
      await redis.del(...keys);
      deleted += keys.length;
    }
  }
  return deleted;
}

async function handleJob(job) {
  console.log(`⚙️ Processing job: ${job.type}`, job.payload);

  if (job.type === 'reset_ip') {
    const { ip, secondary } = job.payload;
    const inputTargets = [ip, secondary].filter(Boolean);
    const allTargets = new Set(inputTargets);

    for (const target of inputTargets) {
      // 1. Resolve dynamic IP <-> API Key mappings in Redis
      const mappedKeys = await redis.smembers(`rl:ip_map:${target}`).catch(() => []);
      mappedKeys.forEach((k) => allTargets.add(k));

      const mappedIps = await redis.smembers(`rl:key_ips:${target}`).catch(() => []);
      mappedIps.forEach((i) => allTargets.add(i));

      // 2. Also check recent blocked stream entries for IP <-> Key linkage
      const recentStream = await redis.xrevrange('rl:stream:blocked', '+', '-', 'COUNT', 50).catch(() => []);
      for (const [, fields] of recentStream) {
        let streamIp = '';
        let streamKey = '';
        for (let i = 0; i < fields.length; i += 2) {
          if (fields[i] === 'ip') streamIp = fields[i + 1];
          if (fields[i] === 'clientKey' || fields[i] === 'identifier') streamKey = fields[i + 1];
        }
        if (streamIp === target && streamKey) {
          allTargets.add(streamKey);
        }
        if (streamKey === target && streamIp) {
          allTargets.add(streamIp);
        }
      }
    }

    let totalDeleted = 0;
    for (const target of allTargets) {
      // ONLY delete rate limiting active window keys (Fixed, Sliding, Token Bucket)
      // NEVER touch rl:keys:*, rl:plan:*, rl:analytics:*, rl:stats:*, or rl:stream:*
      const patterns = [
        `rl:fw:*${target}*`,
        `rl:sw:*${target}*`,
        `rl:tb:*${target}*`,
      ];

      for (const pattern of patterns) {
        totalDeleted += await deleteKeysByPattern(pattern);
      }
    }

    console.log(
      totalDeleted > 0 
        ? `🧹 Cleaned up ${totalDeleted} rate limit window keys for: ${Array.from(allTargets).join(', ')}`
        : `ℹ️ No active rate limit window keys found for: ${Array.from(allTargets).join(', ')}`
    );
  }
}

async function startWorker() {
  if (isRunning) return;
  isRunning = true;
  console.log('👷 Cleanup worker started (listening for jobs)...');

  while (isRunning) {
    try {
      const result = await workerClient.brpop(QUEUE_KEY, 2);
      if (result) {
        const [, jobData] = result;
        const job = JSON.parse(jobData);
        await handleJob(job);
      }
    } catch (err) {
      if (isRunning) {
        console.error('Worker error:', err.message);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}

function stopWorker() {
  isRunning = false;
  workerClient.disconnect();
}

module.exports = { enqueueJob, startWorker, stopWorker };
