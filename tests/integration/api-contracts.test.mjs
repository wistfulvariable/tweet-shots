/**
 * API Contract Tests — verify response shapes, status codes, headers, and
 * error formats for every endpoint. Tests run against a real Express server
 * with mocked Firestore and core.mjs.
 *
 * These tests validate STRUCTURE and TYPES, not specific values, to catch
 * contract drift between code and documentation.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import { createFirestoreMock } from '../helpers/firestore-mock.mjs';
import { TEST_CONFIG, MOCK_KEY_DATA, MOCK_API_KEY, MOCK_TWEET, currentMonth } from '../helpers/test-fixtures.mjs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mock = createFirestoreMock();

vi.mock('../../src/services/firestore.mjs', () => ({
  apiKeysCollection: mock.apiKeysCollection,
  usageCollection: mock.usageCollection,
  customersCollection: mock.customersCollection,
  subscriptionsCollection: mock.subscriptionsCollection,
  FieldValue: mock.FieldValue,
}));

// Uses the REAL extractTweetId to prevent mock drift (audit recommendation #2).
let _realExtractTweetId;

vi.mock('../../core.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  _realExtractTweetId = actual.extractTweetId;
  return {
    ...actual,
    extractTweetId: vi.fn(actual.extractTweetId),
    fetchTweet: vi.fn(async () => structuredClone(MOCK_TWEET)),
    renderTweetToImage: vi.fn(async (tweet, opts = {}) => {
      const format = opts.format || 'png';
      return {
        data: Buffer.from(`fake-${format}-data`),
        format,
        contentType: format === 'svg' ? 'image/svg+xml' : 'image/png',
      };
    }),
  };
});

vi.mock('../../src/services/storage.mjs', () => ({
  upload: vi.fn(async (bucket, filename) =>
    `https://storage.googleapis.com/${bucket}/${filename}`
  ),
}));

const { authenticate } = await import('../../src/middleware/authenticate.mjs');
const { billingGuard } = await import('../../src/middleware/billing-guard.mjs');
const { errorHandler } = await import('../../src/middleware/error-handler.mjs');
const { healthRoutes } = await import('../../src/routes/health.mjs');
const { landingRoutes } = await import('../../src/routes/landing.mjs');
const { screenshotRoutes } = await import('../../src/routes/screenshot.mjs');
const { tweetRoutes } = await import('../../src/routes/tweet.mjs');
const { adminRoutes } = await import('../../src/routes/admin.mjs');
const { billingRoutes } = await import('../../src/routes/billing.mjs');
const { extractTweetId, fetchTweet, renderTweetToImage } = await import('../../core.mjs');
const { upload } = await import('../../src/services/storage.mjs');

// ─── Server Setup ────────────────────────────────────────────────────────────

const mockLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn(() => mockLogger) };
const passthroughRateLimit = (req, res, next) => next();

let server, baseUrl;

beforeAll(async () => {
  const app = express();
  app.use(express.json());

  const authMiddleware = authenticate(mockLogger);
  const billingMiddleware = billingGuard(mockLogger);

  // Public routes
  app.use(landingRoutes());
  app.use(healthRoutes());

  // Authenticated routes
  app.use(screenshotRoutes({
    authenticate: authMiddleware,
    applyRateLimit: passthroughRateLimit,
    billingGuard: billingMiddleware,
    renderPool: null,
    config: TEST_CONFIG,
    logger: mockLogger,
  }));
  app.use(tweetRoutes({
    authenticate: authMiddleware,
    applyRateLimit: passthroughRateLimit,
    billingGuard: billingMiddleware,
    logger: mockLogger,
  }));
  app.use(billingRoutes({ authenticate: authMiddleware, config: TEST_CONFIG, logger: mockLogger }));
  app.use(adminRoutes({ config: TEST_CONFIG, logger: mockLogger }));
  app.use(errorHandler(mockLogger));

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  mock.collections.apiKeys._store.clear();
  mock.collections.usage._store.clear();
  mock.collections.customers._store.clear();
  mock.collections.subscriptions._store.clear();
  mock.resetTimestampCounter();
  vi.clearAllMocks();

  // Restore default mock implementations
  extractTweetId.mockImplementation(_realExtractTweetId);
  fetchTweet.mockImplementation(async () => structuredClone(MOCK_TWEET));
  renderTweetToImage.mockImplementation(async (tweet, opts = {}) => {
    const format = opts.format || 'png';
    return {
      data: Buffer.from(`fake-${format}-data`),
      format,
      contentType: format === 'svg' ? 'image/svg+xml' : 'image/png',
    };
  });
  upload.mockImplementation(async (bucket, filename) =>
    `https://storage.googleapis.com/${bucket}/${filename}`
  );

  // Seed valid API key + usage doc
  mock.collections.apiKeys._store.set(MOCK_API_KEY, { ...MOCK_KEY_DATA });
  mock.collections.usage._store.set(MOCK_API_KEY, {
    total: 5,
    currentMonth: currentMonth(),
    currentMonthCount: 5,
    lastUsed: '2024-01-15T00:00:00.000Z',
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Assert a JSON body matches the standard error shape */
function expectErrorShape(body, expectedCode) {
  expect(body).toHaveProperty('error');
  expect(typeof body.error).toBe('string');
  expect(body.error.length).toBeGreaterThan(0);
  expect(body).toHaveProperty('code');
  expect(body.code).toBe(expectedCode);
}

/** Assert CORS-friendly content-type header */
function expectJsonContentType(res) {
  expect(res.headers.get('content-type')).toContain('application/json');
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC ENDPOINTS — No Auth Required
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contract: GET /health', () => {
  it('returns { status, timestamp } with correct types', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expectJsonContentType(res);

    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(typeof body.status).toBe('string');
    expect(body).toHaveProperty('timestamp');
    expect(typeof body.timestamp).toBe('string');
    // Timestamp should be valid ISO 8601
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});

describe('Contract: GET /pricing', () => {
  it('returns { tiers: [...] } with correct structure per tier', async () => {
    const res = await fetch(`${baseUrl}/pricing`);
    expect(res.status).toBe(200);
    expectJsonContentType(res);

    const body = await res.json();
    expect(body).toHaveProperty('tiers');
    expect(Array.isArray(body.tiers)).toBe(true);
    expect(body.tiers.length).toBeGreaterThanOrEqual(3);

    for (const tier of body.tiers) {
      expect(tier).toHaveProperty('tier');
      expect(typeof tier.tier).toBe('string');
      expect(tier).toHaveProperty('price');
      expect(typeof tier.price).toBe('number');
      expect(tier).toHaveProperty('rateLimit');
      expect(typeof tier.rateLimit).toBe('string');
      expect(tier).toHaveProperty('monthlyCredits');
      expect(typeof tier.monthlyCredits).toBe('number');
    }

    // Verify known tiers exist
    const tierNames = body.tiers.map(t => t.tier);
    expect(tierNames).toContain('free');
    expect(tierNames).toContain('pro');
    expect(tierNames).toContain('business');
  });
});

describe('Contract: GET /docs', () => {
  it('returns documentation with correct top-level keys', async () => {
    const res = await fetch(`${baseUrl}/docs`);
    expect(res.status).toBe(200);
    expectJsonContentType(res);

    const body = await res.json();
    expect(body).toHaveProperty('authentication');
    expect(body.authentication).toHaveProperty('description');
    expect(body.authentication).toHaveProperty('example');

    expect(body).toHaveProperty('endpoints');
    expect(typeof body.endpoints).toBe('object');
    expect(Object.keys(body.endpoints).length).toBeGreaterThanOrEqual(3);

    expect(body).toHaveProperty('rateLimits');
    expect(body.rateLimits).toHaveProperty('free');
    expect(body.rateLimits).toHaveProperty('pro');
    expect(body.rateLimits).toHaveProperty('business');
  });
});

describe('Contract: GET / (landing)', () => {
  it('returns API info JSON for non-HTML clients', async () => {
    const res = await fetch(`${baseUrl}/`, {
      headers: { Accept: 'application/json' },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('name');
    expect(typeof body.name).toBe('string');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('description');
    expect(body).toHaveProperty('endpoints');
    expect(typeof body.endpoints).toBe('object');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION CONTRACT — Error shapes for 401
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contract: Authentication errors', () => {
  it('missing API key returns 401 with MISSING_API_KEY', async () => {
    const res = await fetch(`${baseUrl}/screenshot/1234567890`);
    expect(res.status).toBe(401);
    expectJsonContentType(res);

    const body = await res.json();
    expectErrorShape(body, 'MISSING_API_KEY');
  });

  it('invalid API key returns 401 with INVALID_API_KEY', async () => {
    const res = await fetch(`${baseUrl}/screenshot/1234567890`, {
      headers: { 'X-API-KEY': 'ts_free_nonexistent000000000000' },
    });
    expect(res.status).toBe(401);
    expectJsonContentType(res);

    const body = await res.json();
    expectErrorShape(body, 'INVALID_API_KEY');
  });

  it('apiKey query param works as alternative to header', async () => {
    const res = await fetch(`${baseUrl}/screenshot/1234567890?apiKey=${MOCK_API_KEY}`);
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN AUTH CONTRACT — Error shapes for 403
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contract: Admin auth errors', () => {
  it('missing admin key returns 403 with ADMIN_DENIED', async () => {
    const res = await fetch(`${baseUrl}/admin/keys`);
    expect(res.status).toBe(403);
    expectJsonContentType(res);

    const body = await res.json();
    expectErrorShape(body, 'ADMIN_DENIED');
  });

  it('wrong admin key returns 403 with ADMIN_DENIED', async () => {
    const res = await fetch(`${baseUrl}/admin/keys`, {
      headers: { 'X-Admin-Key': 'wrong-admin-key-value' },
    });
    expect(res.status).toBe(403);

    const body = await res.json();
    expectErrorShape(body, 'ADMIN_DENIED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION CONTRACT — Error shapes for 400
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contract: Validation errors', () => {
  it('invalid query param returns 400 with VALIDATION_ERROR and details array', async () => {
    const res = await fetch(`${baseUrl}/screenshot/1234567890?scale=99`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(400);
    expectJsonContentType(res);

    const body = await res.json();
    expectErrorShape(body, 'VALIDATION_ERROR');
    expect(body).toHaveProperty('details');
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);

    for (const detail of body.details) {
      expect(detail).toHaveProperty('field');
      expect(typeof detail.field).toBe('string');
      expect(detail).toHaveProperty('message');
      expect(typeof detail.message).toBe('string');
    }
  });

  it('invalid POST body returns 400 with VALIDATION_ERROR and details', async () => {
    const res = await fetch(`${baseUrl}/screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': MOCK_API_KEY,
      },
      body: JSON.stringify({ theme: 'invalid-theme', tweetId: '123' }),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expectErrorShape(body, 'VALIDATION_ERROR');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('missing required POST fields returns VALIDATION_ERROR', async () => {
    const res = await fetch(`${baseUrl}/screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': MOCK_API_KEY,
      },
      body: JSON.stringify({ theme: 'dark' }), // no tweetId or tweetUrl
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expectErrorShape(body, 'VALIDATION_ERROR');
  });

  it('signup with missing email returns VALIDATION_ERROR', async () => {
    const res = await fetch(`${baseUrl}/billing/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expectErrorShape(body, 'VALIDATION_ERROR');
  });

  it('signup with invalid email format returns VALIDATION_ERROR', async () => {
    const res = await fetch(`${baseUrl}/billing/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expectErrorShape(body, 'VALIDATION_ERROR');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /screenshot/:tweetIdOrUrl — Response Contract
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contract: GET /screenshot/:tweetIdOrUrl', () => {
  it('returns image binary with correct Content-Type for PNG', async () => {
    const res = await fetch(`${baseUrl}/screenshot/1234567890`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
  });

  it('returns image binary with correct Content-Type for SVG', async () => {
    const res = await fetch(`${baseUrl}/screenshot/1234567890?format=svg`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
  });

  it('sets X-Tweet-ID header as string', async () => {
    const res = await fetch(`${baseUrl}/screenshot/1234567890`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    const tweetId = res.headers.get('x-tweet-id');
    expect(tweetId).toBeDefined();
    expect(typeof tweetId).toBe('string');
    expect(tweetId.length).toBeGreaterThan(0);
  });

  it('sets X-Tweet-Author header as string', async () => {
    const res = await fetch(`${baseUrl}/screenshot/1234567890`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    const author = res.headers.get('x-tweet-author');
    expect(author).toBeDefined();
    expect(typeof author).toBe('string');
  });

  it('sets X-Credits-Remaining and X-Credits-Limit headers', async () => {
    const res = await fetch(`${baseUrl}/screenshot/1234567890`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.headers.get('x-credits-limit')).toBeDefined();
    expect(res.headers.get('x-credits-remaining')).toBeDefined();

    // Values should be parseable as numbers
    const limit = parseInt(res.headers.get('x-credits-limit'), 10);
    const remaining = parseInt(res.headers.get('x-credits-remaining'), 10);
    expect(Number.isInteger(limit)).toBe(true);
    expect(Number.isInteger(remaining)).toBe(true);
    expect(limit).toBeGreaterThan(0);
    expect(remaining).toBeGreaterThanOrEqual(0);
  });

  it('returns SCREENSHOT_FAILED error shape on tweet fetch failure', async () => {
    fetchTweet.mockRejectedValue(new Error('Tweet not found'));
    const res = await fetch(`${baseUrl}/screenshot/999`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(400);
    expectJsonContentType(res);

    const body = await res.json();
    expectErrorShape(body, 'SCREENSHOT_FAILED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /screenshot — Response Contract
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contract: POST /screenshot', () => {
  function post(body) {
    return fetch(`${baseUrl}/screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': MOCK_API_KEY,
      },
      body: JSON.stringify(body),
    });
  }

  it('response=image returns binary with image Content-Type', async () => {
    const res = await post({ tweetId: '1234567890' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/');

    const body = await res.arrayBuffer();
    expect(body.byteLength).toBeGreaterThan(0);
  });

  it('response=base64 returns JSON with { success, tweetId, author, format, data }', async () => {
    const res = await post({ tweetId: '1234567890', response: 'base64' });
    expect(res.status).toBe(200);
    expectJsonContentType(res);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.tweetId).toBe('string');
    expect(typeof body.author).toBe('string');
    expect(typeof body.format).toBe('string');
    expect(['png', 'svg']).toContain(body.format);
    expect(typeof body.data).toBe('string');
    // data should be valid base64
    expect(() => Buffer.from(body.data, 'base64')).not.toThrow();
  });

  it('response=url returns JSON with { success, tweetId, author, format, url }', async () => {
    const res = await post({ tweetId: '1234567890', response: 'url' });
    expect(res.status).toBe(200);
    expectJsonContentType(res);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.tweetId).toBe('string');
    expect(typeof body.author).toBe('string');
    expect(typeof body.format).toBe('string');
    expect(typeof body.url).toBe('string');
    expect(body.url).toMatch(/^https?:\/\//);
  });

  it('URL_NOT_CONFIGURED error has correct shape', async () => {
    const originalBucket = TEST_CONFIG.GCS_BUCKET;
    TEST_CONFIG.GCS_BUCKET = undefined;
    try {
      const res = await post({ tweetId: '1234567890', response: 'url' });
      expect(res.status).toBe(400);

      const body = await res.json();
      expectErrorShape(body, 'URL_NOT_CONFIGURED');
    } finally {
      TEST_CONFIG.GCS_BUCKET = originalBucket;
    }
  });

  it('SCREENSHOT_FAILED error has correct shape', async () => {
    renderTweetToImage.mockRejectedValue(new Error('Satori crash'));
    const res = await post({ tweetId: '1234567890' });
    expect(res.status).toBe(400);

    const body = await res.json();
    expectErrorShape(body, 'SCREENSHOT_FAILED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /tweet/:tweetIdOrUrl — Response Contract
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contract: GET /tweet/:tweetIdOrUrl', () => {
  it('returns { success, tweetId, data } with correct types', async () => {
    const res = await fetch(`${baseUrl}/tweet/1234567890`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(200);
    expectJsonContentType(res);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.tweetId).toBe('string');
    expect(typeof body.data).toBe('object');
    expect(body.data).not.toBeNull();

    // Tweet data should contain at minimum text and user
    expect(body.data).toHaveProperty('text');
    expect(body.data).toHaveProperty('user');
  });

  it('sets credit headers', async () => {
    const res = await fetch(`${baseUrl}/tweet/1234567890`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.headers.get('x-credits-limit')).toBeDefined();
    expect(res.headers.get('x-credits-remaining')).toBeDefined();
  });

  it('FETCH_FAILED error has correct shape', async () => {
    fetchTweet.mockRejectedValue(new Error('404 Not Found'));
    const res = await fetch(`${baseUrl}/tweet/999`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expectErrorShape(body, 'FETCH_FAILED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /billing/signup — Response Contract
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contract: POST /billing/signup', () => {
  it('returns { success, apiKey, tier, credits, message } on success', async () => {
    const res = await fetch(`${baseUrl}/billing/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'contract-test@example.com' }),
    });
    expect(res.status).toBe(200);
    expectJsonContentType(res);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.apiKey).toBe('string');
    expect(body.apiKey).toMatch(/^ts_free_/);
    expect(body.tier).toBe('free');
    expect(typeof body.credits).toBe('number');
    expect(body.credits).toBeGreaterThan(0);
    expect(typeof body.message).toBe('string');
  });

  it('accepts optional name parameter', async () => {
    const res = await fetch(`${baseUrl}/billing/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'named@example.com', name: 'Named User' }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.apiKey).toMatch(/^ts_free_/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Billing — Stripe-dependent endpoints (not configured in test env)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contract: POST /billing/checkout (Stripe not configured)', () => {
  it('returns 503 with BILLING_NOT_CONFIGURED', async () => {
    const res = await fetch(`${baseUrl}/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', tier: 'pro' }),
    });
    expect(res.status).toBe(503);
    expectJsonContentType(res);

    const body = await res.json();
    expectErrorShape(body, 'BILLING_NOT_CONFIGURED');
  });
});

describe('Contract: POST /billing/portal (Stripe not configured)', () => {
  it('returns 503 with BILLING_NOT_CONFIGURED', async () => {
    const res = await fetch(`${baseUrl}/billing/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });
    expect(res.status).toBe(503);
    expectJsonContentType(res);

    const body = await res.json();
    expectErrorShape(body, 'BILLING_NOT_CONFIGURED');
  });
});

describe('Contract: GET /billing/usage', () => {
  it('returns { tier, limit, used, remaining, total, lastUsed } for auth user', async () => {
    const res = await fetch(`${baseUrl}/billing/usage`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(200);
    expectJsonContentType(res);

    const body = await res.json();
    expect(typeof body.tier).toBe('string');
    expect(typeof body.limit).toBe('number');
    expect(typeof body.used).toBe('number');
    expect(typeof body.remaining).toBe('number');
    expect(typeof body.total).toBe('number');

    // remaining should be non-negative
    expect(body.remaining).toBeGreaterThanOrEqual(0);
    // limit should match the tier
    expect(body.limit).toBeGreaterThan(0);
  });

  it('returns 401 without API key', async () => {
    const res = await fetch(`${baseUrl}/billing/usage`);
    expect(res.status).toBe(401);
  });
});

describe('Contract: POST /webhook/stripe (not configured)', () => {
  it('returns 400 with WEBHOOK_NOT_CONFIGURED', async () => {
    const res = await fetch(`${baseUrl}/webhook/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expectJsonContentType(res);

    const body = await res.json();
    expectErrorShape(body, 'WEBHOOK_NOT_CONFIGURED');
  });
});

describe('Contract: GET /billing/success', () => {
  it('returns 200 with HTML content', async () => {
    const res = await fetch(`${baseUrl}/billing/success`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    const text = await res.text();
    expect(text).toContain('<!DOCTYPE html>');
  });
});

describe('Contract: GET /billing/cancel', () => {
  it('returns 200 with HTML content', async () => {
    const res = await fetch(`${baseUrl}/billing/cancel`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    const text = await res.text();
    expect(text).toContain('<!DOCTYPE html>');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS — Response Contract
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contract: POST /admin/keys', () => {
  it('returns { success, apiKey, tier, name } on creation', async () => {
    const res = await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': TEST_CONFIG.ADMIN_KEY,
      },
      body: JSON.stringify({ tier: 'pro', name: 'Contract Test Key' }),
    });
    expect(res.status).toBe(201);
    expectJsonContentType(res);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.apiKey).toBe('string');
    expect(body.apiKey).toMatch(/^ts_/);
    expect(typeof body.tier).toBe('string');
    expect(typeof body.name).toBe('string');
  });

  it('defaults tier to free and name to Unnamed', async () => {
    const res = await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': TEST_CONFIG.ADMIN_KEY,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.tier).toBe('free');
    expect(body.name).toBe('Unnamed');
  });
});

describe('Contract: GET /admin/keys', () => {
  it('returns { keys: [...] } where each key has expected fields', async () => {
    // Create a key first
    await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': TEST_CONFIG.ADMIN_KEY,
      },
      body: JSON.stringify({ tier: 'free', name: 'List Test' }),
    });

    const res = await fetch(`${baseUrl}/admin/keys`, {
      headers: { 'X-Admin-Key': TEST_CONFIG.ADMIN_KEY },
    });
    expect(res.status).toBe(200);
    expectJsonContentType(res);

    const body = await res.json();
    expect(body).toHaveProperty('keys');
    expect(Array.isArray(body.keys)).toBe(true);
    expect(body.keys.length).toBeGreaterThan(0);

    for (const key of body.keys) {
      // key field is a masked string (e.g. "ts_free_abc..." )
      expect(key).toHaveProperty('key');
      expect(typeof key.key).toBe('string');
      expect(key).toHaveProperty('tier');
      expect(typeof key.tier).toBe('string');
      expect(key).toHaveProperty('active');
      expect(typeof key.active).toBe('boolean');
      // _id must NOT be exposed
      expect(key).not.toHaveProperty('_id');
    }
  });

  it('returns empty array when no keys exist', async () => {
    // Clear the seeded MOCK_API_KEY for this test
    mock.collections.apiKeys._store.clear();

    const res = await fetch(`${baseUrl}/admin/keys`, {
      headers: { 'X-Admin-Key': TEST_CONFIG.ADMIN_KEY },
    });
    const body = await res.json();
    expect(body.keys).toEqual([]);
  });
});

describe('Contract: DELETE /admin/keys/:key', () => {
  it('returns { success: true } on successful revocation', async () => {
    // Create key
    const createRes = await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': TEST_CONFIG.ADMIN_KEY,
      },
      body: JSON.stringify({}),
    });
    const { apiKey } = await createRes.json();

    // Delete it
    const res = await fetch(`${baseUrl}/admin/keys/${apiKey}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Key': TEST_CONFIG.ADMIN_KEY },
    });
    expect(res.status).toBe(200);
    expectJsonContentType(res);

    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 with KEY_NOT_FOUND for nonexistent key', async () => {
    const res = await fetch(`${baseUrl}/admin/keys/ts_free_nonexistent00000`, {
      method: 'DELETE',
      headers: { 'X-Admin-Key': TEST_CONFIG.ADMIN_KEY },
    });
    expect(res.status).toBe(404);
    expectJsonContentType(res);

    const body = await res.json();
    expectErrorShape(body, 'KEY_NOT_FOUND');
  });
});

describe('Contract: GET /admin/usage', () => {
  it('returns { stats: [...] } with key data + usage per entry', async () => {
    // Create a key
    await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': TEST_CONFIG.ADMIN_KEY,
      },
      body: JSON.stringify({ tier: 'pro', name: 'Usage Test' }),
    });

    const res = await fetch(`${baseUrl}/admin/usage`, {
      headers: { 'X-Admin-Key': TEST_CONFIG.ADMIN_KEY },
    });
    expect(res.status).toBe(200);
    expectJsonContentType(res);

    const body = await res.json();
    expect(body).toHaveProperty('stats');
    expect(Array.isArray(body.stats)).toBe(true);
    expect(body.stats.length).toBeGreaterThan(0);

    for (const stat of body.stats) {
      // Key metadata fields
      expect(stat).toHaveProperty('tier');
      expect(typeof stat.tier).toBe('string');
      expect(stat).toHaveProperty('active');
      expect(typeof stat.active).toBe('boolean');

      // Usage sub-object
      expect(stat).toHaveProperty('usage');
      expect(typeof stat.usage).toBe('object');
      expect(stat.usage).toHaveProperty('limit');
      expect(typeof stat.usage.limit).toBe('number');
      expect(stat.usage).toHaveProperty('remaining');
      expect(typeof stat.usage.remaining).toBe('number');
      expect(stat.usage).toHaveProperty('used');
      expect(typeof stat.usage.used).toBe('number');
      expect(stat.usage).toHaveProperty('total');
      expect(typeof stat.usage.total).toBe('number');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MONTHLY LIMIT EXCEEDED — 429 Contract
// ═══════════════════════════════════════════════════════════════════════════════

describe('Contract: Monthly limit exceeded (429)', () => {
  it('returns MONTHLY_LIMIT_EXCEEDED with { limit, remaining, tier }', async () => {
    // Exhaust the free tier limit
    mock.collections.usage._store.set(MOCK_API_KEY, {
      total: 50,
      currentMonth: currentMonth(),
      currentMonthCount: 50,
      lastUsed: '2024-01-15T00:00:00.000Z',
    });

    const res = await fetch(`${baseUrl}/screenshot/1234567890`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(429);
    expectJsonContentType(res);

    const body = await res.json();
    expectErrorShape(body, 'MONTHLY_LIMIT_EXCEEDED');
    expect(typeof body.limit).toBe('number');
    expect(typeof body.remaining).toBe('number');
    expect(typeof body.tier).toBe('string');
    expect(body.remaining).toBe(0);
  });
});
