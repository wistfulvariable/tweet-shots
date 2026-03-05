/**
 * Unit tests for usage tracking and enforcement.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFirestoreMock } from '../helpers/firestore-mock.mjs';
import { currentMonth } from '../helpers/test-fixtures.mjs';

const mock = createFirestoreMock();

vi.mock('../../src/services/firestore.mjs', () => ({
  apiKeysCollection: mock.apiKeysCollection,
  usageCollection: mock.usageCollection,
  customersCollection: mock.customersCollection,
  subscriptionsCollection: mock.subscriptionsCollection,
  FieldValue: mock.FieldValue,
}));

const { trackAndEnforce, getUsageStats, checkAndReserveCredits } = await import('../../src/services/usage.mjs');

// currentMonth() imported from shared test-fixtures

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
      lastUsed: '2024-01-15T00:00:00.000Z',
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
      lastUsed: '2024-01-15T00:00:00.000Z',
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
    expect(stats.currentMonth).toBe(currentMonth());
    expect(stats.resetDate).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
  });

  it('returns current month stats', async () => {
    mock.collections.usage._store.set('ts_free_active', {
      total: 25,
      currentMonth: currentMonth(),
      currentMonthCount: 10,
      lastUsed: '2024-01-15T00:00:00.000Z',
    });

    const stats = await getUsageStats('ts_free_active', 'free');
    expect(stats.used).toBe(10);
    expect(stats.remaining).toBe(40);
    expect(stats.currentMonth).toBe(currentMonth());
  });

  it('returns zero used for stale month', async () => {
    mock.collections.usage._store.set('ts_free_stale', {
      total: 100,
      currentMonth: '2023-01', // old month
      currentMonthCount: 50,
      lastUsed: '2024-01-15T00:00:00.000Z',
    });

    const stats = await getUsageStats('ts_free_stale', 'free');
    expect(stats.used).toBe(0);
    expect(stats.remaining).toBe(50);
    expect(stats.currentMonth).toBe(currentMonth());
  });

  it('uses correct limits per tier', async () => {
    const free = await getUsageStats('key1', 'free');
    const pro = await getUsageStats('key2', 'pro');
    const biz = await getUsageStats('key3', 'business');

    expect(free.limit).toBe(50);
    expect(pro.limit).toBe(1000);
    expect(biz.limit).toBe(10000);
  });

  it('clamps remaining to 0 when usage exceeds limit', async () => {
    mock.collections.usage._store.set('ts_free_over', {
      total: 60,
      currentMonth: currentMonth(),
      currentMonthCount: 60, // over free limit of 50
      lastUsed: '2024-01-15T00:00:00.000Z',
    });

    const stats = await getUsageStats('ts_free_over', 'free');
    expect(stats.remaining).toBe(0); // Math.max(0, ...) prevents negative
    expect(stats.used).toBe(60);
  });
});

describe('checkAndReserveCredits', () => {
  beforeEach(() => {
    mock.collections.usage._store.clear();
  });

  it('creates initial usage record for first-time key', async () => {
    const result = await checkAndReserveCredits('ts_free_new', 'free', 5);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(45); // 50 - 5
    expect(result.limit).toBe(50);
    expect(result.tier).toBe('free');

    // Verify Firestore doc was created
    const stored = mock.collections.usage._store.get('ts_free_new');
    expect(stored.total).toBe(5);
    expect(stored.currentMonthCount).toBe(5);
  });

  it('rejects when batch exceeds total limit on fresh key', async () => {
    const result = await checkAndReserveCredits('ts_free_new', 'free', 51);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(50);
    expect(result.error).toContain('exceeds the monthly credit limit');
  });

  it('reserves N credits from existing usage', async () => {
    mock.collections.usage._store.set('ts_pro_active', {
      total: 100,
      currentMonth: currentMonth(),
      currentMonthCount: 200,
      lastUsed: '2024-01-15T00:00:00.000Z',
    });

    const result = await checkAndReserveCredits('ts_pro_active', 'pro', 50);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(750); // 1000 - (200 + 50)

    // Verify atomic increment
    const stored = mock.collections.usage._store.get('ts_pro_active');
    expect(stored.currentMonthCount).toBe(250); // 200 + 50
    expect(stored.total).toBe(150); // 100 + 50
  });

  it('rejects when insufficient credits remain', async () => {
    mock.collections.usage._store.set('ts_free_low', {
      total: 45,
      currentMonth: currentMonth(),
      currentMonthCount: 45,
      lastUsed: '2024-01-15T00:00:00.000Z',
    });

    const result = await checkAndReserveCredits('ts_free_low', 'free', 10);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(5);
    expect(result.error).toContain('5 credits remaining');
  });

  it('allows batch that exactly fills remaining credits', async () => {
    mock.collections.usage._store.set('ts_free_edge', {
      total: 40,
      currentMonth: currentMonth(),
      currentMonthCount: 40,
      lastUsed: '2024-01-15T00:00:00.000Z',
    });

    const result = await checkAndReserveCredits('ts_free_edge', 'free', 10);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0); // exactly at limit
  });

  it('rejects batch one over the remaining credits', async () => {
    mock.collections.usage._store.set('ts_free_edge', {
      total: 40,
      currentMonth: currentMonth(),
      currentMonthCount: 40,
      lastUsed: '2024-01-15T00:00:00.000Z',
    });

    const result = await checkAndReserveCredits('ts_free_edge', 'free', 11);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(10);
  });

  it('resets counter on month rollover', async () => {
    mock.collections.usage._store.set('ts_free_old', {
      total: 50,
      currentMonth: '2023-12', // old month
      currentMonthCount: 50,
      lastUsed: '2024-01-15T00:00:00.000Z',
    });

    const result = await checkAndReserveCredits('ts_free_old', 'free', 5);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(45); // reset: 50 - 5
  });

  it('rejects on month rollover if batch exceeds total limit', async () => {
    mock.collections.usage._store.set('ts_free_rollover', {
      total: 50,
      currentMonth: '2023-12',
      currentMonthCount: 50,
      lastUsed: '2024-01-15T00:00:00.000Z',
    });

    const result = await checkAndReserveCredits('ts_free_rollover', 'free', 51);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(50);
  });

  it('uses free tier limits for unknown tier', async () => {
    const result = await checkAndReserveCredits('ts_unknown_abc', 'unknown_tier', 1);
    expect(result.limit).toBe(50);
  });

  it('works correctly with business tier limits', async () => {
    const result = await checkAndReserveCredits('ts_biz_new', 'business', 500);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9500); // 10000 - 500
    expect(result.limit).toBe(10000);
  });
});
