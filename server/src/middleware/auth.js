const { getKeyData } = require('../services/apiKeyService');

const ADMIN_MASTER_KEY = process.env.ADMIN_KEY || 'shield_admin_master_key';

async function identifyClient(req, res, next) {
  const authHeader = req.headers['authorization'];
  let apiKey = req.headers['x-api-key'];

  if (!apiKey && authHeader && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.slice(7).trim();
  }

  if (!apiKey) {
    req.user = {
      role: 'user',
      plan: 'free',
      key: 'anonymous',
      name: 'Anonymous (Free IP)',
      id: req.ip,
    };
    return next();
  }

  const keyData = await getKeyData(apiKey);
  if (!keyData) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: `Invalid API key "${apiKey}". Use free_test_key, pro_test_key, ent_test_key, or adm_test_key.`,
    });
  }

  req.user = {
    role: keyData.role,
    plan: keyData.plan,
    key: keyData.key,
    name: keyData.name,
    id: keyData.key,
  };

  next();
}

function requireAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'];

  if (adminKey && adminKey === ADMIN_MASTER_KEY) {
    req.user = {
      role: 'admin',
      plan: 'enterprise',
      key: 'master_admin',
      name: 'Master Environment Admin',
      id: 'master_admin',
    };
    return next();
  }

  if (req.user && req.user.role === 'admin') {
    return next();
  }

  return res.status(403).json({
    error: 'FORBIDDEN',
    message: 'Administrative privileges required. Provide adm_test_key via x-api-key or valid x-admin-key.',
    userRole: req.user?.role || 'unauthenticated',
  });
}

module.exports = { identifyClient, requireAdmin };
