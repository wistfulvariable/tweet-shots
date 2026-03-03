/**
 * Integration tests for admin routes.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import { createFirestoreMock } from '../helpers/firestore-mock.mjs';
import { TEST_CONFIG } from '../helpers/test-fixtures.mjs';

// Mock Firestore before importing admin routes
const mock = createFirestoreMock();

vi.mock('../../src/services/firestore.mjs', () => ({
  apiKeysCollection: mock.apiKeysCollection,
  usageCollection: mock.usageCollection,
  customersCollection: mock.customersCollection,
  subscriptionsCollection: mock.subscriptionsCollection,
  FieldValue: mock.FieldValue,
}));

const { adminRoutes } = await import('../../src/routes/admin.mjs');

const mockLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

let app, server, baseUrl;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(adminRoutes({ config: TEST_CONFIG, logger: mockLogger }));

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
});

describe('POST /admin/keys', () => {
  it('returns 403 without admin key', async () => {
    const res = await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 'free' }),
    });
    expect(res.status).toBe(403);
  });

  it('creates a free key with valid admin auth', async () => {
    const res = await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': TEST_CONFIG.ADMIN_KEY,
      },
      body: JSON.stringify({ name: 'Test Key' }),
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.apiKey).toMatch(/^ts_free_/);
    expect(body.tier).toBe('free');
    expect(body.name).toBe('Test Key');
  });

  it('creates a pro key', async () => {
    const res = await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': TEST_CONFIG.ADMIN_KEY,
      },
      body: JSON.stringify({ tier: 'pro', name: 'Pro Key' }),
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.apiKey).toMatch(/^ts_pro_/);
    expect(body.tier).toBe('pro');
  });

  it('returns validation error for invalid tier', async () => {
    const res = await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': TEST_CONFIG.ADMIN_KEY,
      },
      body: JSON.stringify({ tier: 'enterprise' }),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /admin/keys', () => {
  it('lists created keys', async () => {
    // Create two keys first
    await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': TEST_CONFIG.ADMIN_KEY,
      },
      body: JSON.stringify({ name: 'Key 1' }),
    });
    await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': TEST_CONFIG.ADMIN_KEY,
      },
      body: JSON.stringify({ name: 'Key 2', tier: 'pro' }),
    });

    const res = await fetch(`${baseUrl}/admin/keys`, {
      headers: { 'X-Admin-Key': TEST_CONFIG.ADMIN_KEY },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.keys).toHaveLength(2);
    // Keys should be masked in the response
    expect(body.keys[0].key).toContain('...');
  });
});

describe('DELETE /admin/keys/:key', () => {
  it('revokes an existing key', async () => {
    // Create a key
    const createRes = await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': TEST_CONFIG.ADMIN_KEY,
      },
      body: JSON.stringify({ name: 'To Revoke' }),
    });
    const { apiKey } = await createRes.json();

    // Revoke it
    const res = await fetch(`${baseUrl}/admin/keys/${apiKey}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Key': TEST_CONFIG.ADMIN_KEY },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 404 for non-existent key', async () => {
    const res = await fetch(`${baseUrl}/admin/keys/ts_free_nonexistent`, {
      method: 'DELETE',
      headers: { 'X-Admin-Key': TEST_CONFIG.ADMIN_KEY },
    });
    expect(res.status).toBe(404);
  });
});
