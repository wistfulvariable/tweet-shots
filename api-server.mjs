#!/usr/bin/env node

/**
 * tweet-shots API Server
 *
 * A production-ready REST API for generating tweet screenshots.
 *
 * Features:
 * - API key authentication
 * - Rate limiting (configurable per tier)
 * - Usage tracking
 * - Multiple output formats (PNG, SVG, base64, URL)
 * - Full customization options
 * - Stripe billing integration
 * - Health checks and metrics
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Core rendering library (single source of truth)
import {
  extractTweetId,
  fetchTweet,
  renderTweetToImage,
  DIMENSIONS,
} from './core.mjs';

// Billing integration
import { addBillingRoutes } from './stripe-billing.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',

  // API Keys storage (in production, use Redis or a database)
  apiKeysFile: process.env.API_KEYS_FILE || path.join(__dirname, 'api-keys.json'),
  usageFile: process.env.USAGE_FILE || path.join(__dirname, 'usage.json'),

  // Rate limits by tier (requests per minute)
  rateLimits: {
    free: { windowMs: 60000, max: 10 },
    pro: { windowMs: 60000, max: 100 },
    business: { windowMs: 60000, max: 1000 },
  },

  // Output directory for generated images (optional URL mode)
  outputDir: process.env.OUTPUT_DIR || path.join(__dirname, 'output'),
  publicUrl: process.env.PUBLIC_URL || null,
};

// ============================================================================
// DATA STORAGE (Simple JSON - replace with DB in production)
// ============================================================================

function loadJSON(filepath, defaultValue = {}) {
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
  } catch (e) {
    console.error(`Error loading ${filepath}:`, e.message);
  }
  return defaultValue;
}

function saveJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

// API Keys: { "key": { tier: "free|pro|business", name: "...", created: "...", active: true } }
let apiKeys = loadJSON(CONFIG.apiKeysFile, {});

// Usage: { "key": { total: 0, monthly: { "2024-01": 0 }, lastUsed: "..." } }
let usage = loadJSON(CONFIG.usageFile, {});

function trackUsage(apiKey) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  if (!usage[apiKey]) {
    usage[apiKey] = { total: 0, monthly: {}, lastUsed: null };
  }

  usage[apiKey].total++;
  usage[apiKey].monthly[monthKey] = (usage[apiKey].monthly[monthKey] || 0) + 1;
  usage[apiKey].lastUsed = now.toISOString();

  // Save periodically (every 10 requests)
  if (usage[apiKey].total % 10 === 0) {
    saveJSON(CONFIG.usageFile, usage);
  }
}

// ============================================================================
// EXPRESS APP
// ============================================================================

const app = express();

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

// Raw body capture for Stripe webhook signature verification — must run before express.json()
app.use((req, res, next) => {
  if (req.path === '/webhook/stripe') {
    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk; });
    req.on('end', () => {
      req.rawBody = rawBody;
      try { req.body = JSON.parse(rawBody || '{}'); } catch { req.body = {}; }
      next();
    });
  } else {
    express.json()(req, res, next);
  }
});

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// AUTH & RATE LIMITING
// ============================================================================

function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required', code: 'MISSING_API_KEY' });
  }

  const keyData = apiKeys[apiKey];
  if (!keyData || !keyData.active) {
    return res.status(401).json({ error: 'Invalid API key', code: 'INVALID_API_KEY' });
  }

  req.apiKey = apiKey;
  req.keyData = keyData;
  next();
}

function createRateLimiter(tier) {
  const limits = CONFIG.rateLimits[tier] || CONFIG.rateLimits.free;
  return rateLimit({
    windowMs: limits.windowMs,
    max: limits.max,
    message: { error: 'Rate limit exceeded', code: 'RATE_LIMITED' },
    keyGenerator: (req) => req.apiKey,
  });
}

const rateLimiters = {
  free: createRateLimiter('free'),
  pro: createRateLimiter('pro'),
  business: createRateLimiter('business'),
};

function applyRateLimit(req, res, next) {
  const tier = req.keyData?.tier || 'free';
  const limiter = rateLimiters[tier] || rateLimiters.free;
  limiter(req, res, next);
}

// Signup rate limiter — by IP, no API key required on this route
const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many signups from this IP, try again later', code: 'RATE_LIMITED' },
});

// ============================================================================
// API ROUTES
// ============================================================================

// Health check (no auth)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Landing page
app.get('/', (req, res) => {
  const acceptsHtml = req.headers.accept?.includes('text/html');

  if (acceptsHtml) {
    const landingPath = path.join(__dirname, 'landing.html');
    if (fs.existsSync(landingPath)) {
      return res.sendFile(landingPath);
    }
  }

  res.json({
    name: 'tweet-shots API',
    version: '1.0.0',
    description: 'Generate beautiful tweet screenshots',
    docs: '/docs',
    pricing: '/pricing',
    endpoints: {
      'GET /screenshot/:tweetId': 'Generate screenshot (returns image)',
      'POST /screenshot': 'Generate screenshot with options',
      'GET /tweet/:tweetId': 'Get tweet data as JSON',
    },
  });
});

// Documentation
app.get('/docs', (req, res) => {
  res.json({
    authentication: {
      description: 'Include API key in X-API-KEY header or apiKey query param',
      example: 'curl -H "X-API-KEY: your-key" https://api.example.com/screenshot/123',
    },
    endpoints: {
      'GET /screenshot/:tweetId': {
        description: 'Generate screenshot and return image',
        params: { tweetId: 'Tweet ID or full URL' },
        query: {
          theme: 'light|dark|dim|black (default: dark)',
          dimension: 'auto|instagramFeed|instagramStory|tiktok|linkedin|twitter|facebook|youtube',
          format: 'png|svg (default: png)',
          scale: '1|2|3 (default: 1)',
          gradient: 'sunset|ocean|forest|fire|midnight|sky|candy|peach',
          bgColor: 'Hex color',
          textColor: 'Hex color',
          linkColor: 'Hex color',
          hideMetrics: 'true|false',
          hideMedia: 'true|false',
          hideDate: 'true|false',
          hideVerified: 'true|false',
          hideShadow: 'true|false',
          padding: 'Number (default: 20)',
          radius: 'Number (default: 16)',
        },
      },
      'POST /screenshot': {
        description: 'Generate screenshot with JSON body',
        body: {
          tweetId: 'Required - Tweet ID or URL',
          response: 'image|base64|url (default: image)',
        },
      },
    },
    rateLimits: CONFIG.rateLimits,
  });
});

// GET screenshot (returns image directly)
app.get('/screenshot/:tweetIdOrUrl', authenticate, applyRateLimit, async (req, res) => {
  try {
    const tweetId = extractTweetId(decodeURIComponent(req.params.tweetIdOrUrl));
    const tweet = await fetchTweet(tweetId);

    const dimension = req.query.dimension || 'auto';
    const options = {
      theme: req.query.theme || 'dark',
      width: DIMENSIONS[dimension]?.width || 550,
      format: req.query.format || 'png',
      scale: parseInt(req.query.scale) || 1,
      backgroundGradient: req.query.gradient,
      backgroundColor: req.query.bgColor,
      textColor: req.query.textColor,
      linkColor: req.query.linkColor,
      showMetrics: req.query.hideMetrics !== 'true',
      hideMedia: req.query.hideMedia === 'true',
      hideDate: req.query.hideDate === 'true',
      hideVerified: req.query.hideVerified === 'true',
      hideShadow: req.query.hideShadow === 'true',
      padding: parseInt(req.query.padding) || 20,
      borderRadius: parseInt(req.query.radius) || 16,
    };

    const result = await renderTweetToImage(tweet, options);

    trackUsage(req.apiKey);

    res.set('Content-Type', result.contentType);
    res.set('X-Tweet-ID', tweetId);
    res.set('X-Tweet-Author', tweet.user?.screen_name || 'unknown');
    res.send(result.data);

  } catch (error) {
    console.error('Screenshot error:', error.message);
    res.status(400).json({ error: error.message, code: 'SCREENSHOT_FAILED' });
  }
});

// POST screenshot (with JSON options)
app.post('/screenshot', authenticate, applyRateLimit, async (req, res) => {
  try {
    const { tweetId: rawId, tweetUrl, response: responseType = 'image', ...options } = req.body;

    const tweetId = extractTweetId(rawId || tweetUrl);
    const tweet = await fetchTweet(tweetId);

    const dimension = options.dimension || 'auto';
    const result = await renderTweetToImage(tweet, {
      theme: options.theme || 'dark',
      width: DIMENSIONS[dimension]?.width || 550,
      format: options.format || 'png',
      scale: options.scale || 1,
      backgroundGradient: options.gradient || options.backgroundGradient,
      backgroundColor: options.bgColor || options.backgroundColor,
      textColor: options.textColor,
      linkColor: options.linkColor,
      showMetrics: options.hideMetrics !== true && options.showMetrics !== false,
      hideMedia: options.hideMedia === true,
      hideDate: options.hideDate === true,
      hideVerified: options.hideVerified === true,
      hideShadow: options.hideShadow === true,
      padding: options.padding || 20,
      borderRadius: options.radius || options.borderRadius || 16,
    });

    trackUsage(req.apiKey);

    if (responseType === 'base64') {
      return res.json({
        success: true,
        tweetId,
        author: tweet.user?.screen_name,
        format: result.format,
        data: result.data.toString('base64'),
      });
    }

    if (responseType === 'url') {
      if (!CONFIG.publicUrl) {
        return res.status(400).json({ error: 'URL response not configured', code: 'URL_NOT_CONFIGURED' });
      }

      const filename = `${tweetId}-${Date.now()}.${result.format}`;
      const filepath = path.join(CONFIG.outputDir, filename);

      if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
      }

      fs.writeFileSync(filepath, result.data);

      return res.json({
        success: true,
        tweetId,
        author: tweet.user?.screen_name,
        format: result.format,
        url: `${CONFIG.publicUrl}/${filename}`,
      });
    }

    // Default: return image
    res.set('Content-Type', result.contentType);
    res.send(result.data);

  } catch (error) {
    console.error('Screenshot error:', error.message);
    res.status(400).json({ error: error.message, code: 'SCREENSHOT_FAILED' });
  }
});

// GET tweet data
app.get('/tweet/:tweetIdOrUrl', authenticate, applyRateLimit, async (req, res) => {
  try {
    const tweetId = extractTweetId(decodeURIComponent(req.params.tweetIdOrUrl));
    const tweet = await fetchTweet(tweetId);

    trackUsage(req.apiKey);

    res.json({ success: true, tweetId, data: tweet });

  } catch (error) {
    res.status(400).json({ error: error.message, code: 'FETCH_FAILED' });
  }
});

// ============================================================================
// ADMIN ROUTES
// ============================================================================

const ADMIN_KEY = process.env.ADMIN_KEY || 'admin-secret-key';

function adminAuth(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Admin access denied' });
  }
  next();
}

// Create API key
app.post('/admin/keys', adminAuth, (req, res) => {
  const { name, tier = 'free' } = req.body;

  const apiKey = `ts_${tier}_${uuidv4().replace(/-/g, '')}`;

  apiKeys[apiKey] = {
    name: name || 'Unnamed',
    tier,
    created: new Date().toISOString(),
    active: true,
  };

  saveJSON(CONFIG.apiKeysFile, apiKeys);

  res.json({ success: true, apiKey, tier, name });
});

// List API keys
app.get('/admin/keys', adminAuth, (req, res) => {
  const keys = Object.entries(apiKeys).map(([key, data]) => ({
    key: key.slice(0, 12) + '...',
    ...data,
    usage: usage[key] || { total: 0 },
  }));
  res.json({ keys });
});

// Revoke API key
app.delete('/admin/keys/:key', adminAuth, (req, res) => {
  const { key } = req.params;
  if (apiKeys[key]) {
    apiKeys[key].active = false;
    saveJSON(CONFIG.apiKeysFile, apiKeys);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Key not found' });
  }
});

// Usage stats
app.get('/admin/usage', adminAuth, (req, res) => {
  const stats = Object.entries(usage).map(([key, data]) => ({
    key: key.slice(0, 12) + '...',
    keyName: apiKeys[key]?.name,
    tier: apiKeys[key]?.tier,
    ...data,
  }));
  res.json({ stats });
});

// ============================================================================
// SIGNUP ROUTE (free tier — no Stripe required)
// ============================================================================

app.post('/billing/signup', signupLimiter, async (req, res) => {
  const { email, name } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  const apiKey = `ts_free_${uuidv4().replace(/-/g, '').slice(0, 24)}`;

  apiKeys[apiKey] = {
    name: name || email,
    email,
    tier: 'free',
    created: new Date().toISOString(),
    active: true,
  };

  saveJSON(CONFIG.apiKeysFile, apiKeys);

  res.json({
    success: true,
    apiKey,
    tier: 'free',
    credits: 50,
    message: 'Your API key is ready! Save it somewhere safe.',
  });
});

// ============================================================================
// STATIC FILES (for URL response mode)
// ============================================================================

if (fs.existsSync(CONFIG.outputDir)) {
  app.use('/images', express.static(CONFIG.outputDir));
}

// ============================================================================
// STRIPE BILLING ROUTES
// ============================================================================

// Wire up billing routes. Callbacks keep the in-memory apiKeys map and
// api-keys.json in sync when Stripe subscription events change a customer's tier.
addBillingRoutes(app, {
  onKeySync: (apiKey, keyData) => {
    apiKeys[apiKey] = keyData;
    saveJSON(CONFIG.apiKeysFile, apiKeys);
  },
  onKeyRevoke: (apiKey) => {
    if (apiKeys[apiKey]) {
      apiKeys[apiKey].active = false;
      saveJSON(CONFIG.apiKeysFile, apiKeys);
    }
  },
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(CONFIG.port, CONFIG.host, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    tweet-shots API                         ║
╠════════════════════════════════════════════════════════════╣
║  Server running at http://${CONFIG.host}:${CONFIG.port}                    ║
║                                                            ║
║  Endpoints:                                                ║
║    GET  /                    API info                      ║
║    GET  /docs                Documentation                 ║
║    GET  /health              Health check                  ║
║    GET  /screenshot/:id      Generate screenshot           ║
║    POST /screenshot          Generate with options         ║
║    GET  /tweet/:id           Get tweet data                ║
║                                                            ║
║  Admin (requires X-Admin-Key header):                      ║
║    POST   /admin/keys        Create API key                ║
║    GET    /admin/keys        List API keys                 ║
║    DELETE /admin/keys/:key   Revoke API key                ║
║    GET    /admin/usage       Usage statistics              ║
╚════════════════════════════════════════════════════════════╝
  `);

  // Create a default API key for testing if none exist
  if (Object.keys(apiKeys).length === 0) {
    const testKey = 'ts_free_test123';
    apiKeys[testKey] = { name: 'Test Key', tier: 'free', created: new Date().toISOString(), active: true };
    saveJSON(CONFIG.apiKeysFile, apiKeys);
    console.log(`\n  Test API key created: ${testKey}\n`);
  }
});

export default app;
