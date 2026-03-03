/**
 * Unit tests for usage tracking and enforcement.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFirestoreMock } from '../helpers/firestore-mock.mjs';

const mock = createFirestoreMock();

vi.mock('../../src/services/firestore.mjs', () => ({
  apiKeysCollection: mock.apiKeysCollection,
  usageCollection: mock.usageCollection,
  customersCollection: mock.customersCollection,
  subscriptionsCollection: mock.subscriptionsCollection,
  FieldValue: mock.FieldValue,
}));

const { trackAndEnforce, getUsageStats } = await import('../../src/services/usage.mjs');

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

describe('trackAndEnforce', () => {
  beforeEach(() => {
    mock.collections.usage._store.clear();
  });

  it('creates initial usage record on first call', async () => {
    const result = await trackAndEnforce('ts_free_abc123', 'free');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(49); // free tier: 50 credits, used 1
    expect(result.limit).toBe(50);
    expect(result.tier).toBe('free');
  });

  it('increments usage on subsequent calls', async () => {
    await trackAndEnforce('ts_free_abc123', 'free');
    const result = await trackAndEnforce('ts_free_abc123', 'free');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(48); // 50 - 2
  });

  it('rejects when at monthly limit', async () => {
    const key = 'ts_free_limited';
    // Set usage to exactly the free limit
    mock.collections.usage._store.set(key, {
      total: 50,
      currentMonth: currentMonth(),
      currentMonthCount: 50,
      lastUsed: new Date().toISOString(),
    });

    const result = await trackAndEnforce(key, 'free');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.error).toContain('Monthly credit limit');
  });

  it('allows more requests for pro tier', async () => {
    const result = await trackAndEnforce('ts_pro_abc123', 'pro');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(1000);
    expect(result.remaining).toBe(999);
  });

  it('allows more requests for business tier', async () => {
    const result = await trackAndEnforce('ts_biz_abc123', 'business');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(10000);
    expect(result.remaining).toBe(9999);
  });

  it('resets counter on month rollover', async () => {
    const key = 'ts_free_rollover';
    mock.collections.usage._store.set(key, {
      total: 45,
      currentMonth: '2023-12', // old month
      currentMonthCount: 45,
      lastUsed: new Date().toISOString(),
    });

    const result = await trackAndEnforce(key, 'free');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(49); // reset: 50 - 1
  });

  it('uses free tier limits for unknown tier', async () => {
    const result = await trackAndEnforce('ts_unknown_abc', 'unknown_tier');
    expect(result.limit).toBe(50); // falls back to free
  });
});

describe('getUsageStats', () => {
  beforeEach(() => {
    mock.collections.usage._store.clear();
  });

  it('returns zero stats for new key', async () => {
    const stats = await getUsageStats('ts_free_new', 'free');
    expect(stats.used).toBe(0);
    expect(stats.remaining).toBe(50);
    expect(stats.limit).toBe(50);
    expect(stats.total).toBe(0);
  });

  it('returns current month stats', async () => {
    mock.collections.usage._store.set('ts_free_active', {
      total: 25,
      currentMonth: currentMonth(),
      currentMonthCount: 10,
      lastUsed: new Date().toISOString(),
    });

    const stats = await getUsageStats('ts_free_active', 'free');
    expect(stats.used).toBe(10);
    expect(stats.remaining).toBe(40);
    expect(stats.total).toBe(25);
  });

  it('returns zero used for stale month', async () => {
    mock.collections.usage._store.set('ts_free_stale', {
      total: 100,
      currentMonth: '2023-01', // old month
      currentMonthCount: 50,
      lastUsed: new Date().toISOString(),
    });

    const stats = await getUsageStats('ts_free_stale', 'free');
    expect(stats.used).toBe(0);
    expect(stats.remaining).toBe(50);
    expect(stats.total).toBe(100);
  });

  it('uses correct limits per tier', async () => {
    const free = await getUsageStats('key1', 'free');
    const pro = await getUsageStats('key2', 'pro');
    const biz = await getUsageStats('key3', 'business');

    expect(free.limit).toBe(50);
    expect(pro.limit).toBe(1000);
    expect(biz.limit).toBe(10000);
  });
});
