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
    const { ip } = job.payload;
    const deleted = await deleteKeysByPattern(`rl:*:${ip}*`);
    console.log(
      deleted > 0 
        ? `🧹 Cleaned up ${deleted} keys for IP: ${ip}`
        : `ℹ️ No active keys found for IP: ${ip}`
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