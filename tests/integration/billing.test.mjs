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
