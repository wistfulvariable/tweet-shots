/**
 * Integration tests for admin usage stats and error paths.
 * Covers the previously untested admin routes: GET /admin/usage,
 * error handling in key listing, and error handling in key creation.
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /admin/usage', () => {
  it('returns usage stats for all keys', async () => {
    // Create two keys first
    await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': TEST_CONFIG.ADMIN_KEY,
      },
      body: JSON.stringify({ name: 'Key A' }),
    });
    await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': TEST_CONFIG.ADMIN_KEY,
      },
      body: JSON.stringify({ name: 'Key B', tier: 'pro' }),
    });

    const res = await fetch(`${baseUrl}/admin/usage`, {
      headers: { 'X-Admin-Key': TEST_CONFIG.ADMIN_KEY },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.stats).toHaveLength(2);

    // Each stat should include key data + usage object
    for (const stat of body.stats) {
      expect(stat.key).toBeDefined();
      expect(stat.usage).toBeDefined();
      expect(stat.usage.limit).toBeDefined();
      expect(stat.usage.remaining).toBeDefined();
    }
  });

  it('returns empty stats when no keys exist', async () => {
    const res = await fetch(`${baseUrl}/admin/usage`, {
      headers: { 'X-Admin-Key': TEST_CONFIG.ADMIN_KEY },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.stats).toHaveLength(0);
  });

  it('returns 403 without admin key', async () => {
    const res = await fetch(`${baseUrl}/admin/usage`);
    expect(res.status).toBe(403);
  });

  it('includes tier-correct usage limits', async () => {
    // Create a pro key
    const createRes = await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': TEST_CONFIG.ADMIN_KEY,
      },
      body: JSON.stringify({ tier: 'pro', name: 'Pro Key' }),
    });
    expect(createRes.status).toBe(200);

    const res = await fetch(`${baseUrl}/admin/usage`, {
      headers: { 'X-Admin-Key': TEST_CONFIG.ADMIN_KEY },
    });
    const body = await res.json();
    const proStat = body.stats.find(s => s.tier === 'pro');

    expect(proStat).toBeDefined();
    expect(proStat.usage.limit).toBe(1000); // Pro tier = 1000 monthly credits
    expect(proStat.usage.remaining).toBe(1000);
  });
});

describe('Admin route error responses', () => {
  it('returns wrong admin key as 403', async () => {
    const res = await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': 'wrong-key-value-here',
      },
      body: JSON.stringify({ tier: 'free' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('ADMIN_DENIED');
  });

  it('strips _id from key listing', async () => {
    // Create a key
    await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': TEST_CONFIG.ADMIN_KEY,
      },
      body: JSON.stringify({ name: 'Test' }),
    });

    const res = await fetch(`${baseUrl}/admin/keys`, {
      headers: { 'X-Admin-Key': TEST_CONFIG.ADMIN_KEY },
    });
    const body = await res.json();

    for (const key of body.keys) {
      expect(key._id).toBeUndefined();
      expect(key.key).toBeDefined();
      expect(key.key).toContain('...');
    }
  });

  it('returns default name "Unnamed" when name not provided', async () => {
    const res = await fetch(`${baseUrl}/admin/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': TEST_CONFIG.ADMIN_KEY,
      },
      body: JSON.stringify({ tier: 'free' }),
    });
    const body = await res.json();
    expect(body.name).toBe('Unnamed');
  });
});
