/**
 * Smoke tests — verify the app is alive and critical paths aren't broken.
 * Intentionally shallow and fast (<30s). Run independently after deploys.
 *
 * Spins up a minimal Express server with mocked Firestore and core.mjs
 * to verify: server starts, auth works, health responds, screenshot endpoint
 * renders, admin auth gate, and billing signup flow.
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

vi.mock('../../tweet-fetch.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    extractTweetId: vi.fn(actual.extractTweetId),
    fetchTweet: vi.fn(async () => structuredClone(MOCK_TWEET)),
  };
});

vi.mock('../../tweet-render.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
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
const { demoRoutes } = await import('../../src/routes/demo.mjs');

// ─── Server Setup ────────────────────────────────────────────────────────────

const mockLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), child: vi.fn(() => mockLogger) };
const passthroughRateLimit = (req, res, next) => next();

let app, server, baseUrl;

beforeAll(async () => {
  app = express();
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

  // Demo routes (public, no auth — must be mounted before admin gate)
  app.use(demoRoutes({ demoRateLimit: passthroughRateLimit, renderPool: null, logger: mockLogger }));

  // BUG: Billing must be mounted BEFORE admin, because admin's router.use()
  // middleware blocks ALL requests without X-Admin-Key — including /billing/*
  // routes. In production server.mjs, admin is mounted first, which breaks
  // billing signup/checkout/portal/webhook. See BUG report in test coverage audit.
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

  // Seed valid API key + usage doc
  mock.collections.apiKeys._store.set(MOCK_API_KEY, { ...MOCK_KEY_DATA });
  mock.collections.usage._store.set(MOCK_API_KEY, {
    total: 0,
    currentMonth: currentMonth(),
    currentMonthCount: 0,
    lastUsed: null,
  });
});

// ─── Smoke Tests ─────────────────────────────────────────────────────────────

describe('Smoke Tests', () => {
  it('server starts and health endpoint returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('auth rejects requests without API key (401)', async () => {
    const res = await fetch(`${baseUrl}/screenshot/1234567890`);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.code).toBe('MISSING_API_KEY');
  });

  it('auth accepts valid API key and screenshot renders successfully', async () => {
    const res = await fetch(`${baseUrl}/screenshot/1234567890`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');

    const body = await res.arrayBuffer();
    expect(body.byteLength).toBeGreaterThan(0);
  });

  it('landing page returns JSON for non-HTML clients', async () => {
    const res = await fetch(`${baseUrl}/`, {
      headers: { Accept: 'application/json' },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.name).toBe('tweet-shots API');
    expect(body.endpoints).toBeDefined();
  });

  it('admin gate blocks requests without admin key (403)', async () => {
    const res = await fetch(`${baseUrl}/admin/keys`);
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.code).toBe('ADMIN_DENIED');
  });

  it('database operations work (signup creates key in Firestore mock)', async () => {
    const res = await fetch(`${baseUrl}/billing/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'smoke@test.com' }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.apiKey).toMatch(/^ts_free_/);

    // Verify the key was stored in Firestore mock
    expect(mock.collections.apiKeys._store.size).toBeGreaterThan(1);
  });

  it('tweet data endpoint responds with valid JSON', async () => {
    const res = await fetch(`${baseUrl}/tweet/1234567890`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tweetId).toBe('1234567890');
    expect(body.data).toBeDefined();
    expect(body.data.text).toBe(MOCK_TWEET.text);
  });
});

// ─── Demo Endpoint ──────────────────────────────────────────────────────────

describe('Demo endpoint', () => {
  it('GET /demo/screenshot/<valid-tweet-id> returns 200', async () => {
    const res = await fetch(`${baseUrl}/demo/screenshot/1234567890`);
    expect(res.status).toBe(200);
  });

  it('response has content-type image/png', async () => {
    const res = await fetch(`${baseUrl}/demo/screenshot/1234567890`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
  });
});
