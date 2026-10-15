// Redis concepts: PUBLISH, SUBSCRIBE (real-time messaging)
const { redis, subscriber } = require('../config/redis');

const CHANNEL = 'rl:events';

const listeners = [];

function publishBlockedEvent({ip, endpoint, algorithm}) {
  const payload = JSON.stringify({
    type: 'BLOCKED',
    ip,
    endpoint,
    algorithm,
    timestamp: Date.now(),
  });

  redis.publish(CHANNEL, payload).catch((err) => {
    console.error('Publish error:', err.message);
  });
}

function onBlockEvent(callback) {
  listeners.push(callback);

  return () => {
    const idx = listeners.indexOf(callback);
    if (idx !== -1) listeners.splice(idx, 1);
  }
}

function startSubscriber() {
  subscriber.subscribe(CHANNEL, (err) => {
    if (err) console.error('Subscribe error:', err.message);
    else console.log(`📡 Listening on channel: ${CHANNEL}`);
  });

  subscriber.on('message', (channel, message) => {
    if (channel !== CHANNEL) return;

    try {
      const data = JSON.parse(message);
      listeners.forEach((cb) => cb(data));
    } catch (err) {
      console.error('Message parse error:', err.message);
    }
  });
}

module.exports = { publishBlockedEvent, onBlockEvent, startSubscriber };