require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { rateLimiter } = require('./middleware/rateLimiter');
const { identifyClient, requireAdmin } = require('./middleware/auth');
const { seedApiKeys, getAllKeys } = require('./services/apiKeyService');
const { getRecentBlocked } = require('./services/streamLogger');
const { startSubscriber } = require('./services/eventPublisher');
const { getAnalytics, recordRequest } = require('./services/analytics');
const { seedPlans, getPlan, getAllPlans, updatePlan } = require('./services/planConfig');
const { enqueueJob, startWorker } = require('./services/cleanupWorker');

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { onBlockEvent } = require('./services/eventPublisher');

startSubscriber();
startWorker();

const app = express();

// CORS with explicit exposedHeaders so the browser Fetch API can read rate limit headers
app.use(cors({
  origin: '*',
  exposedHeaders: [
    'X-Client-Role',
    'X-Client-Plan',
    'X-Client-Key',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Latency-Ms',
    'X-Redis-Algorithm',
    'Retry-After',
  ],
}));

app.use(express.json());

// Global client identification middleware
app.use(identifyClient);

// Public API Keys metadata endpoint (used by UI for Persona Selector)
app.get('/api/keys', async (req, res) => {
  const keys = await getAllKeys();
  res.json(keys);
});

// Ping endpoint with client tier headers (bypass rate limiter)
app.get('/api/ping', (req, res) => {
  recordRequest({ ip: req.user?.id || req.ip, endpoint: '/api/ping', allowed: true, latencyMs: 0.045 });
  res.set({
    'X-Client-Role': req.user?.role || 'user',
    'X-Client-Plan': req.user?.plan || 'free',
    'X-Client-Key': req.user?.key || 'anonymous',
    'X-RateLimit-Limit': 'Unlimited',
    'X-RateLimit-Remaining': 'Bypass',
    'X-RateLimit-Latency-Ms': '0.045',
    'X-Redis-Algorithm': 'healthcheck_bypass',
  });
  res.json({ message: "pong", user: req.user, rateLimit: { limit: 'Unlimited', remaining: 'Bypass' } });
});

// Rate-limited playground endpoints
app.get('/api/data', rateLimiter({ algorithm: 'fixed' }), (req, res) => {
  res.json({ message: "data get", user: req.user, rateLimit: req.rateLimit });
});

app.post('/api/submit', rateLimiter({ algorithm: 'sliding' }), (req, res) => {
  res.json({ received: req.body, user: req.user, rateLimit: req.rateLimit });
});

app.get('/api/token', rateLimiter({ algorithm: 'token' }), (req, res) => {
  res.json({ message: "token bucket works!", user: req.user, rateLimit: req.rateLimit });
});

// Read-only dashboard endpoints
app.get('/api/admin/blocked', async (req, res) => {
  const result = await getRecentBlocked(req.query);
  res.json(result);
});

app.get('/api/admin/analytics', async (req, res) => {
  const stats = await getAnalytics();
  res.json(stats);
});

app.get('/api/admin/plans', async (req, res) => {
  const plans = await getAllPlans();
  res.json(plans);
});

app.get('/api/admin/plans/:name', async (req, res) => {
  const plan = await getPlan(req.params.name);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  res.json(plan);
});

// Admin-only mutation endpoints: protected by requireAdmin middleware!
// Only role: "admin" (e.g. adm_test_key) or master secret is permitted
app.patch('/api/admin/plans/:name', requireAdmin, async (req, res) => {
  try {
    const updated = await updatePlan(req.params.name, req.body);
    if (!updated) return res.status(404).json({ error: 'Plan not found' });
    res.json({ message: 'Plan updated', plan: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/reset-ip', requireAdmin, async (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP is required' });

  await enqueueJob('reset_ip', { ip });
  res.json({ message: `Reset job enqueued for IP: ${ip}` });
});

// Serve production Vite frontend if built
const path = require('path');
const fs = require('fs');
const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = http.createServer(app);

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
});

onBlockEvent((data) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  await seedPlans();
  await seedApiKeys();
  console.log(`Server running on http://localhost:${PORT}`);
});
