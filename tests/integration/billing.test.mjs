/**
 * Integration tests for billing routes.
 * Tests signup flow and usage stats (no Stripe required).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import { createFirestoreMock } from '../helpers/firestore-mock.mjs';
import { TEST_CONFIG } from '../helpers/test-fixtures.mjs';

const mock = createFirestoreMock();

vi.mock('../../src/services/firestore.mjs', () => ({
  apiKeysCollection: mock.apiKeysCollection,
  usageCollection: mock.usageCollection,
  customersCollection: mock.customersCollection,
  subscriptionsCollection: mock.subscriptionsCollection,
  FieldValue: mock.FieldValue,
}));

// Mock api-keys so validateApiKey works with our mock store
vi.mock('../../src/services/api-keys.mjs', async () => {
  const actual = await vi.importActual('../../src/services/api-keys.mjs');
  return actual;
});

const { billingRoutes } = await import('../../src/routes/billing.mjs');
const { authenticate } = await import('../../src/middleware/authenticate.mjs');

const mockLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

let app, server, baseUrl;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(billingRoutes({
    authenticate: authenticate(mockLogger),
    config: TEST_CONFIG,
    logger: mockLogger,
  }));

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
});

describe('POST /billing/signup', () => {
  it('creates a free API key for valid email', async () => {
    const res = await fetch(`${baseUrl}/billing/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.apiKey).toMatch(/^ts_free_/);
    expect(body.tier).toBe('free');
    expect(body.credits).toBe(50);
  });

  it('returns validation error for missing email', async () => {
    const res = await fetch(`${baseUrl}/billing/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns validation error for invalid email', async () => {
    const res = await fetch(`${baseUrl}/billing/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    expect(res.status).toBe(400);
  });

});

describe('POST /billing/checkout', () => {
  it('returns 503 when Stripe is not configured', async () => {
    const res = await fetch(`${baseUrl}/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', tier: 'pro' }),
    });
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.code).toBe('BILLING_NOT_CONFIGURED');
  });
});

describe('POST /billing/portal', () => {
  it('returns 503 when Stripe is not configured', async () => {
    const res = await fetch(`${baseUrl}/billing/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com' }),
    });
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.code).toBe('BILLING_NOT_CONFIGURED');
  });
});

describe('GET /billing/usage', () => {
  it('returns usage stats for authenticated user', async () => {
    // First create a key via signup
    const signupRes = await fetch(`${baseUrl}/billing/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'usage@example.com' }),
    });
    const { apiKey } = await signupRes.json();

    const res = await fetch(`${baseUrl}/billing/usage`, {
      headers: { 'X-API-KEY': apiKey },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.tier).toBe('free');
    expect(body.limit).toBe(50);
    expect(body.used).toBe(0);
    expect(body.remaining).toBe(50);
  });

  it('returns 401 without API key', async () => {
    const res = await fetch(`${baseUrl}/billing/usage`);
    expect(res.status).toBe(401);
  });
});

describe('POST /webhook/stripe', () => {
  it('returns 400 when webhook not configured', async () => {
    const res = await fetch(`${baseUrl}/webhook/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.code).toBe('WEBHOOK_NOT_CONFIGURED');
  });
});

describe('GET /billing/success', () => {
  it('returns success HTML page', async () => {
    const res = await fetch(`${baseUrl}/billing/success`);
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toContain('Payment Successful');
  });
});

describe('GET /billing/cancel', () => {
  it('returns cancel HTML page', async () => {
    const res = await fetch(`${baseUrl}/billing/cancel`);
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).toContain('Payment Cancelled');
  });
});

// ============================================================================
// CHARACTERIZATION TESTS — capture current billing behavior before refactoring
// ============================================================================

// Uses a fresh server to get a clean rate limiter for characterization tests
describe('Billing routes — characterization tests', () => {
  let charServer, charBaseUrl;

  beforeAll(async () => {
    const charApp = express();
    charApp.use(express.json());
    charApp.use(billingRoutes({
      authenticate: authenticate(mockLogger),
      config: TEST_CONFIG,
      logger: mockLogger,
    }));

    await new Promise((resolve) => {
      charServer = charApp.listen(0, '127.0.0.1', () => {
        charBaseUrl = `http://127.0.0.1:${charServer.address().port}`;
        resolve();
      });
    });
  });

  afterAll(() => {
    charServer?.close();
  });

  beforeEach(() => {
    mock.collections.apiKeys._store.clear();
    mock.collections.usage._store.clear();
    mock.collections.customers._store.clear();
  });

  // ─── Signup characterization ─────────────────────────────────────

  it('signup with name stores name on the API key document', async () => {
    const res = await fetch(`${charBaseUrl}/billing/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'named@example.com', name: 'Alice Test' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    const keyDoc = mock.collections.apiKeys._store.get(body.apiKey);
    expect(keyDoc).toBeDefined();
    expect(keyDoc.name).toBe('Alice Test');
  });

  it('signup stores email on the API key document', async () => {
    const res = await fetch(`${charBaseUrl}/billing/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'stored@example.com' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);

    const keyDoc = mock.collections.apiKeys._store.get(body.apiKey);
    expect(keyDoc).toBeDefined();
    expect(keyDoc.email).toBe('stored@example.com');
  });

  it('signup without name uses email as name fallback', async () => {
    const res = await fetch(`${charBaseUrl}/billing/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'noname@example.com' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);

    const keyDoc = mock.collections.apiKeys._store.get(body.apiKey);
    expect(keyDoc).toBeDefined();
    expect(keyDoc.name).toBe('noname@example.com');
  });

  it('signup response includes success message with API key mention', async () => {
    const res = await fetch(`${charBaseUrl}/billing/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'msg@example.com' }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.message).toMatch(/API key/i);
    expect(body.credits).toBe(50);
    expect(body.tier).toBe('free');
  });

  // ─── Checkout validation characterization ────────────────────────

  it('checkout rejects missing email with validation error', async () => {
    const res = await fetch(`${charBaseUrl}/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 'pro' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('checkout rejects invalid tier value with validation error', async () => {
    const res = await fetch(`${charBaseUrl}/billing/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', tier: 'free' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // ─── Portal validation characterization ──────────────────────────

  it('portal rejects missing email with validation error', async () => {
    const res = await fetch(`${charBaseUrl}/billing/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('portal rejects invalid email with validation error', async () => {
    const res = await fetch(`${charBaseUrl}/billing/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bad-email' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // ─── Usage characterization (keys seeded directly in mock store) ─

  it('usage returns current month counts when usage data exists', async () => {
    const testKey = 'ts_free_char0000000000000000000001';
    mock.collections.apiKeys._store.set(testKey, {
      tier: 'free', name: 'Usage Test', email: 'usage@test.com',
      active: true, created: new Date().toISOString(),
    });

    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    mock.collections.usage._store.set(testKey, {
      total: 10, currentMonth, currentMonthCount: 10,
      lastUsed: new Date().toISOString(),
    });

    const res = await fetch(`${charBaseUrl}/billing/usage`, {
      headers: { 'X-API-KEY': testKey },
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.used).toBe(10);
    expect(body.remaining).toBe(40);
    expect(body.limit).toBe(50);
    expect(body.total).toBe(10);
  });

  it('usage returns 0 used when month has rolled over', async () => {
    const testKey = 'ts_free_char0000000000000000000002';
    mock.collections.apiKeys._store.set(testKey, {
      tier: 'free', name: 'Stale Test', email: 'stale@test.com',
      active: true, created: new Date().toISOString(),
    });

    mock.collections.usage._store.set(testKey, {
      total: 25, currentMonth: '2025-01', currentMonthCount: 25,
      lastUsed: '2025-01-15T00:00:00Z',
    });

    const res = await fetch(`${charBaseUrl}/billing/usage`, {
      headers: { 'X-API-KEY': testKey },
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.used).toBe(0);
    expect(body.remaining).toBe(50);
    expect(body.total).toBe(25);
  });

  it('usage response includes all expected fields', async () => {
    const testKey = 'ts_free_char0000000000000000000003';
    mock.collections.apiKeys._store.set(testKey, {
      tier: 'free', name: 'Fields Test', email: 'fields@test.com',
      active: true, created: new Date().toISOString(),
    });

    const res = await fetch(`${charBaseUrl}/billing/usage`, {
      headers: { 'X-API-KEY': testKey },
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({
      tier: 'free',
      used: expect.any(Number),
      limit: expect.any(Number),
      remaining: expect.any(Number),
      total: expect.any(Number),
    }));
  });

  // ─── Webhook characterization ────────────────────────────────────

  it('webhook returns WEBHOOK_NOT_CONFIGURED even with stripe-signature header', async () => {
    const res = await fetch(`${charBaseUrl}/webhook/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=1234567890,v1=abc123def456',
      },
      body: JSON.stringify({ type: 'test.event' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('WEBHOOK_NOT_CONFIGURED');
  });

  // ─── Success/cancel page characterization ────────────────────────

  it('success page contains back-to-API link', async () => {
    const res = await fetch(`${charBaseUrl}/billing/success`);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain('href="/"');
    expect(text).toContain('Back to API');
  });

  it('cancel page contains retry message and back link', async () => {
    const res = await fetch(`${charBaseUrl}/billing/cancel`);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toContain('try again');
    expect(text).toContain('href="/"');
  });
});

// Uses a fresh server to get a clean rate limiter (signupLimiter: 5 req/15min)
describe('POST /billing/signup — idempotency', () => {
  let idempotentServer, idempotentBaseUrl;

  beforeAll(async () => {
    const idempotentApp = express();
    idempotentApp.use(express.json());
    idempotentApp.use(billingRoutes({
      authenticate: authenticate(mockLogger),
      config: TEST_CONFIG,
      logger: mockLogger,
    }));

    await new Promise((resolve) => {
      idempotentServer = idempotentApp.listen(0, '127.0.0.1', () => {
        idempotentBaseUrl = `http://127.0.0.1:${idempotentServer.address().port}`;
        resolve();
      });
    });
  });

  afterAll(() => {
    idempotentServer?.close();
  });

  beforeEach(() => {
    mock.collections.apiKeys._store.clear();
    mock.collections.customers._store.clear();
  });

  it('returns the same key for duplicate signups with the same email', async () => {
    const res1 = await fetch(`${idempotentBaseUrl}/billing/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'idempotent@example.com' }),
    });
    const body1 = await res1.json();
    expect(body1.success).toBe(true);

    const res2 = await fetch(`${idempotentBaseUrl}/billing/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'idempotent@example.com' }),
    });
    const body2 = await res2.json();
    expect(body2.success).toBe(true);

    expect(body2.apiKey).toBe(body1.apiKey);

    // Only one key should exist for this email
    const allKeys = [...mock.collections.apiKeys._store.entries()];
    const keysForEmail = allKeys.filter(([, data]) => data.email === 'idempotent@example.com');
    expect(keysForEmail).toHaveLength(1);
  });
});
