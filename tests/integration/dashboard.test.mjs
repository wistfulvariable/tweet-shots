/**
 * Integration tests for dashboard routes.
 * Mocks Firebase token verification but uses real Express + fetch.
 * Follows project pattern: real server + native fetch (no supertest).
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import { createFirestoreMock } from '../helpers/firestore-mock.mjs';
import { MOCK_FIREBASE_TOKEN, TEST_CONFIG } from '../helpers/test-fixtures.mjs';

const mock = createFirestoreMock();

// Mock Firestore
vi.mock('../../src/services/firestore.mjs', () => ({
  apiKeysCollection: mock.apiKeysCollection,
  usageCollection: mock.usageCollection,
  customersCollection: mock.customersCollection,
  subscriptionsCollection: mock.subscriptionsCollection,
  FieldValue: mock.FieldValue,
  getDb: mock.getDb,
}));

// Mock firebase-auth service (token verification)
vi.mock('../../src/services/firebase-auth.mjs', () => ({
  verifyIdToken: vi.fn(),
}));

// Mock Stripe
vi.mock('../../src/services/stripe.mjs', () => ({
  createStripeClient: vi.fn(() => null),
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
}));

// Use real api-keys service (works with mock Firestore)
vi.mock('../../src/services/api-keys.mjs', async () => {
  const actual = await vi.importActual('../../src/services/api-keys.mjs');
  return actual;
});

const { verifyIdToken } = await import('../../src/services/firebase-auth.mjs');
const { createStripeClient, createCheckoutSession, createPortalSession } = await import('../../src/services/stripe.mjs');
const { firebaseAuth } = await import('../../src/middleware/firebase-auth.mjs');
const { dashboardRoutes } = await import('../../src/routes/dashboard.mjs');
const { errorHandler } = await import('../../src/middleware/error-handler.mjs');

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

// ─── Server with Firebase configured ────────────────────────────

const CONFIG_WITH_FIREBASE = {
  ...TEST_CONFIG,
  FIREBASE_WEB_API_KEY: 'AIzaSyTest123',
  FIREBASE_AUTH_DOMAIN: 'tweet-shots-api.firebaseapp.com',
};

let app, server, baseUrl;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.id = 'test-req-id';
    next();
  });
  app.use(dashboardRoutes({
    firebaseAuth: firebaseAuth(logger),
    config: CONFIG_WITH_FIREBASE,
    logger,
  }));
  app.use(errorHandler(logger));

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
  vi.clearAllMocks();
  mock.resetTimestampCounter();
  mock.collections.customers._store.clear();
  mock.collections.apiKeys._store.clear();
  mock.collections.usage._store.clear();
  createStripeClient.mockReturnValue(null);
});

function authHeaders(token = 'valid-token') {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ─── GET /dashboard ──────────────────────────────────────────────

describe('GET /dashboard', () => {
  it('returns HTML page with Firebase SDK script tags', async () => {
    const res = await fetch(`${baseUrl}/dashboard`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    const text = await res.text();
    expect(text).toContain('firebase-app-compat.js');
    expect(text).toContain('firebase-auth-compat.js');
    expect(text).toContain('AIzaSyTest123');
    expect(text).toContain('tweet-shots-api.firebaseapp.com');
    expect(text).toContain('Sign in with Google');
  });

  it('does not require authentication', async () => {
    const res = await fetch(`${baseUrl}/dashboard`);

    expect(res.status).toBe(200);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});

// ─── Server without Firebase configured (separate server) ────────

describe('GET /dashboard (no Firebase config)', () => {
  let noFirebaseServer, noFirebaseUrl;

  beforeAll(async () => {
    const noFirebaseApp = express();
    noFirebaseApp.use(express.json());
    noFirebaseApp.use(dashboardRoutes({
      firebaseAuth: firebaseAuth(logger),
      config: TEST_CONFIG,
      logger,
    }));

    await new Promise((resolve) => {
      noFirebaseServer = noFirebaseApp.listen(0, '127.0.0.1', () => {
        noFirebaseUrl = `http://127.0.0.1:${noFirebaseServer.address().port}`;
        resolve();
      });
    });
  });

  afterAll(() => {
    noFirebaseServer?.close();
  });

  it('returns "not configured" message without Firebase env vars', async () => {
    const res = await fetch(`${noFirebaseUrl}/dashboard`);

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Dashboard Not Available');
    expect(text).toContain('not configured');
    expect(text).not.toContain('firebase-app-compat.js');
  });
});

// ─── POST /dashboard/api/link ──────────────────────────────────

describe('POST /dashboard/api/link', () => {
  it('returns 401 without Bearer token', async () => {
    const res = await fetch(`${baseUrl}/dashboard/api/link`, { method: 'POST' });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('FIREBASE_AUTH_REQUIRED');
  });

  it('returns 401 with invalid token', async () => {
    verifyIdToken.mockRejectedValue(new Error('Invalid token'));

    const res = await fetch(`${baseUrl}/dashboard/api/link`, {
      method: 'POST',
      headers: authHeaders('bad-token'),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('INVALID_TOKEN');
  });

  it('creates new user with free tier on first sign-in', async () => {
    verifyIdToken.mockResolvedValue(MOCK_FIREBASE_TOKEN);

    const res = await fetch(`${baseUrl}/dashboard/api/link`, {
      method: 'POST',
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.isNew).toBe(true);
    expect(body.tier).toBe('free');
    expect(body.apiKeyId).toBeDefined();
    expect(body.apiKeyId).toMatch(/^ts_free_/);
  });

  it('links existing customer on subsequent sign-in', async () => {
    verifyIdToken.mockResolvedValue(MOCK_FIREBASE_TOKEN);

    // Pre-populate existing customer (from /billing/signup)
    mock.collections.customers._store.set('test@example.com', {
      email: 'test@example.com',
      name: 'Test User',
      apiKeyId: 'ts_free_existing123456789012',
      tier: 'pro',
    });

    const res = await fetch(`${baseUrl}/dashboard/api/link`, {
      method: 'POST',
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.isNew).toBe(false);
    expect(body.tier).toBe('pro');

    // Verify firebaseUid was added
    const customer = mock.collections.customers._store.get('test@example.com');
    expect(customer.firebaseUid).toBe('firebase-uid-abc123');
  });

  it('returns 403 when email linked to different Firebase UID', async () => {
    verifyIdToken.mockResolvedValue(MOCK_FIREBASE_TOKEN);

    mock.collections.customers._store.set('test@example.com', {
      email: 'test@example.com',
      name: 'Other User',
      apiKeyId: 'ts_free_other1234567890abcd',
      tier: 'free',
      firebaseUid: 'different-uid-999',
    });

    const res = await fetch(`${baseUrl}/dashboard/api/link`, {
      method: 'POST',
      headers: authHeaders(),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('already linked to a different account');
  });

  it('is idempotent — returns same data on repeated calls', async () => {
    verifyIdToken.mockResolvedValue(MOCK_FIREBASE_TOKEN);

    // First call creates user
    const res1 = await fetch(`${baseUrl}/dashboard/api/link`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const body1 = await res1.json();
    expect(body1.isNew).toBe(true);

    // Second call returns existing
    const res2 = await fetch(`${baseUrl}/dashboard/api/link`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const body2 = await res2.json();
    expect(body2.isNew).toBe(false);
    expect(body2.apiKeyId).toBe(body1.apiKeyId);
  });
});

// ─── GET /dashboard/api/data ───────────────────────────────────

describe('GET /dashboard/api/data', () => {
  it('returns 401 without auth', async () => {
    const res = await fetch(`${baseUrl}/dashboard/api/data`);

    expect(res.status).toBe(401);
  });

  it('returns 404 if customer not found', async () => {
    verifyIdToken.mockResolvedValue(MOCK_FIREBASE_TOKEN);

    const res = await fetch(`${baseUrl}/dashboard/api/data`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('returns API key, usage, and tier info for existing customer', async () => {
    verifyIdToken.mockResolvedValue(MOCK_FIREBASE_TOKEN);

    mock.collections.customers._store.set('test@example.com', {
      email: 'test@example.com',
      name: 'Test User',
      apiKeyId: 'ts_free_dashdata1234567890',
      tier: 'free',
      firebaseUid: 'firebase-uid-abc123',
    });
    mock.collections.apiKeys._store.set('ts_free_dashdata1234567890', {
      active: true,
      tier: 'free',
    });

    const res = await fetch(`${baseUrl}/dashboard/api/data`, {
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apiKey).toBe('ts_free_dashdata1234567890');
    expect(body.apiKeyMasked).toBe('ts_free_dash...');
    expect(body.tier).toBe('free');
    expect(body.isActive).toBe(true);
    expect(body.usage).toBeDefined();
    expect(body.usage.tier).toBe('free');
    expect(body.tierDetails).toEqual({
      rateLimit: 10,
      monthlyCredits: 50,
      price: 0,
    });
  });
});

// ─── POST /dashboard/api/checkout ──────────────────────────────

describe('POST /dashboard/api/checkout', () => {
  it('returns 503 when Stripe not configured', async () => {
    verifyIdToken.mockResolvedValue(MOCK_FIREBASE_TOKEN);

    const res = await fetch(`${baseUrl}/dashboard/api/checkout`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ tier: 'pro' }),
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('BILLING_NOT_CONFIGURED');
  });
});

// ─── POST /dashboard/api/portal ────────────────────────────────

describe('POST /dashboard/api/portal', () => {
  it('returns 503 when Stripe not configured', async () => {
    verifyIdToken.mockResolvedValue(MOCK_FIREBASE_TOKEN);

    const res = await fetch(`${baseUrl}/dashboard/api/portal`, {
      method: 'POST',
      headers: authHeaders(),
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('BILLING_NOT_CONFIGURED');
  });
});

// ─── Stripe-configured server (separate instance) ───────────────

describe('Dashboard with Stripe configured', () => {
  let stripeServer, stripeUrl;

  beforeAll(async () => {
    // createStripeClient must return truthy at route-factory time
    createStripeClient.mockReturnValue({});
    const stripeApp = express();
    stripeApp.use(express.json());
    stripeApp.use((req, res, next) => { req.id = 'test-req-id'; next(); });
    stripeApp.use(dashboardRoutes({
      firebaseAuth: firebaseAuth(logger),
      config: CONFIG_WITH_FIREBASE,
      logger,
    }));
    stripeApp.use(errorHandler(logger));

    await new Promise((resolve) => {
      stripeServer = stripeApp.listen(0, '127.0.0.1', () => {
        stripeUrl = `http://127.0.0.1:${stripeServer.address().port}`;
        resolve();
      });
    });
  });

  afterAll(() => {
    stripeServer?.close();
  });

  it('returns 400 for invalid tier on checkout', async () => {
    verifyIdToken.mockResolvedValue(MOCK_FIREBASE_TOKEN);

    const res = await fetch(`${stripeUrl}/dashboard/api/checkout`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ tier: 'invalid' }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when tier is missing on checkout', async () => {
    verifyIdToken.mockResolvedValue(MOCK_FIREBASE_TOKEN);

    const res = await fetch(`${stripeUrl}/dashboard/api/checkout`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns Stripe checkout URL for valid pro tier', async () => {
    verifyIdToken.mockResolvedValue(MOCK_FIREBASE_TOKEN);
    createCheckoutSession.mockResolvedValue({
      url: 'https://checkout.stripe.com/cs_test_123',
      id: 'cs_test_123',
    });

    const res = await fetch(`${stripeUrl}/dashboard/api/checkout`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ tier: 'pro' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://checkout.stripe.com/cs_test_123');
    expect(body.sessionId).toBe('cs_test_123');
  });

  it('returns Stripe portal URL', async () => {
    verifyIdToken.mockResolvedValue(MOCK_FIREBASE_TOKEN);
    createPortalSession.mockResolvedValue({
      url: 'https://billing.stripe.com/bps_test_123',
    });

    const res = await fetch(`${stripeUrl}/dashboard/api/portal`, {
      method: 'POST',
      headers: authHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://billing.stripe.com/bps_test_123');
  });
});

// ─── Full flow test ────────────────────────────────────────────

describe('Full flow: link → data → round-trip consistency', () => {
  it('creates user via link, then returns consistent data', async () => {
    verifyIdToken.mockResolvedValue(MOCK_FIREBASE_TOKEN);

    // Step 1: Link user (creates API key + customer)
    const linkRes = await fetch(`${baseUrl}/dashboard/api/link`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const linkBody = await linkRes.json();
    expect(linkBody.isNew).toBe(true);
    const apiKeyId = linkBody.apiKeyId;

    // Verify the real createApiKey populated the mock Firestore
    expect(mock.collections.apiKeys._store.has(apiKeyId)).toBe(true);

    // Step 2: Get data
    const dataRes = await fetch(`${baseUrl}/dashboard/api/data`, {
      headers: authHeaders(),
    });
    const dataBody = await dataRes.json();

    expect(dataRes.status).toBe(200);
    expect(dataBody.apiKey).toBe(apiKeyId);
    expect(dataBody.tier).toBe('free');
    expect(dataBody.isActive).toBe(true);
    expect(dataBody.email).toBe('test@example.com');
  });
});
