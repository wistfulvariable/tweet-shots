/**
 * Unit tests for dashboard service — getOrLinkUser + getDashboardData.
 * Uses in-memory Firestore mock.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFirestoreMock } from '../helpers/firestore-mock.mjs';

const firestoreMock = createFirestoreMock();

// Mock Firestore
vi.mock('../../src/services/firestore.mjs', () => firestoreMock);

// Mock api-keys service
vi.mock('../../src/services/api-keys.mjs', () => ({
  createApiKey: vi.fn(async ({ tier, name, email }) => ({
    keyString: `ts_${tier}_mock1234567890abcdef`,
  })),
  findKeyByEmail: vi.fn(async () => null),
}));

// Mock usage service
vi.mock('../../src/services/usage.mjs', () => ({
  getUsageStats: vi.fn(async (keyString, tier) => ({
    tier,
    used: 5,
    limit: 50,
    remaining: 45,
    total: 100,
    lastUsed: '2026-03-01T00:00:00.000Z',
  })),
}));

const { createApiKey, findKeyByEmail } = await import('../../src/services/api-keys.mjs');
const { getUsageStats } = await import('../../src/services/usage.mjs');
const { getOrLinkUser, getDashboardData } = await import('../../src/services/dashboard.mjs');

const FIREBASE_USER = {
  uid: 'firebase-uid-abc123',
  email: 'test@example.com',
  name: 'Test User',
};

describe('getOrLinkUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMock.resetTimestampCounter();
    firestoreMock.collections.customers._store.clear();
    firestoreMock.collections.apiKeys._store.clear();
    firestoreMock.collections.usage._store.clear();
  });

  it('creates new user with free API key when no customer exists', async () => {
    findKeyByEmail.mockResolvedValue(null);

    const result = await getOrLinkUser(FIREBASE_USER);

    expect(result.isNew).toBe(true);
    expect(result.tier).toBe('free');
    expect(result.email).toBe('test@example.com');
    expect(result.name).toBe('Test User');
    expect(result.firebaseUid).toBe('firebase-uid-abc123');
    expect(result.apiKeyId).toBe('ts_free_mock1234567890abcdef');
    expect(createApiKey).toHaveBeenCalledWith({
      tier: 'free',
      name: 'Test User',
      email: 'test@example.com',
    });
  });

  it('links Firebase UID to existing customer without firebaseUid', async () => {
    // Pre-populate existing customer (from /billing/signup)
    firestoreMock.collections.customers._store.set('test@example.com', {
      email: 'test@example.com',
      name: 'Test User',
      apiKeyId: 'ts_free_existing1234567890ab',
      tier: 'free',
    });

    const result = await getOrLinkUser(FIREBASE_USER);

    expect(result.isNew).toBe(false);
    expect(result.firebaseUid).toBe('firebase-uid-abc123');
    expect(result.apiKeyId).toBe('ts_free_existing1234567890ab');
    expect(createApiKey).not.toHaveBeenCalled();

    // Verify Firestore was updated
    const updated = firestoreMock.collections.customers._store.get('test@example.com');
    expect(updated.firebaseUid).toBe('firebase-uid-abc123');
  });

  it('returns as-is when customer already linked to this Firebase UID (idempotent)', async () => {
    firestoreMock.collections.customers._store.set('test@example.com', {
      email: 'test@example.com',
      name: 'Test User',
      apiKeyId: 'ts_free_existing1234567890ab',
      tier: 'pro',
      firebaseUid: 'firebase-uid-abc123',
    });

    const result = await getOrLinkUser(FIREBASE_USER);

    expect(result.isNew).toBe(false);
    expect(result.tier).toBe('pro');
    expect(result.apiKeyId).toBe('ts_free_existing1234567890ab');
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it('throws 403 when customer is linked to a different Firebase UID', async () => {
    firestoreMock.collections.customers._store.set('test@example.com', {
      email: 'test@example.com',
      name: 'Original User',
      apiKeyId: 'ts_free_existing1234567890ab',
      tier: 'free',
      firebaseUid: 'firebase-uid-DIFFERENT',
    });

    await expect(getOrLinkUser(FIREBASE_USER)).rejects.toThrow('already linked to a different account');
    const err = await getOrLinkUser(FIREBASE_USER).catch(e => e);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('ACCOUNT_CONFLICT');
  });

  it('links to orphaned API key (key exists by email, no customer record)', async () => {
    findKeyByEmail.mockResolvedValue({
      keyString: 'ts_free_orphaned1234567890ab',
      tier: 'free',
    });

    const result = await getOrLinkUser(FIREBASE_USER);

    expect(result.isNew).toBe(false);
    expect(result.apiKeyId).toBe('ts_free_orphaned1234567890ab');
    expect(result.firebaseUid).toBe('firebase-uid-abc123');
    expect(createApiKey).not.toHaveBeenCalled();

    // Verify customer was created in Firestore
    const stored = firestoreMock.collections.customers._store.get('test@example.com');
    expect(stored.apiKeyId).toBe('ts_free_orphaned1234567890ab');
    expect(stored.firebaseUid).toBe('firebase-uid-abc123');
  });

  it('stores customer data in Firestore for new users', async () => {
    findKeyByEmail.mockResolvedValue(null);

    await getOrLinkUser(FIREBASE_USER);

    const stored = firestoreMock.collections.customers._store.get('test@example.com');
    expect(stored).toBeDefined();
    expect(stored.email).toBe('test@example.com');
    expect(stored.name).toBe('Test User');
    expect(stored.tier).toBe('free');
    expect(stored.firebaseUid).toBe('firebase-uid-abc123');
  });
});

describe('getDashboardData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firestoreMock.resetTimestampCounter();
    firestoreMock.collections.customers._store.clear();
    firestoreMock.collections.apiKeys._store.clear();
  });

  it('returns null for nonexistent customer', async () => {
    const result = await getDashboardData('nobody@example.com');
    expect(result).toBeNull();
  });

  it('returns complete dashboard data for existing customer', async () => {
    firestoreMock.collections.customers._store.set('test@example.com', {
      email: 'test@example.com',
      name: 'Test User',
      apiKeyId: 'ts_free_abcdef1234567890ab',
      tier: 'free',
      stripeCustomerId: 'cus_test123',
    });
    firestoreMock.collections.apiKeys._store.set('ts_free_abcdef1234567890ab', {
      active: true,
      tier: 'free',
    });

    const result = await getDashboardData('test@example.com');

    expect(result.apiKey).toBe('ts_free_abcdef1234567890ab');
    expect(result.apiKeyMasked).toBe('ts_free_abcd...');
    expect(result.tier).toBe('free');
    expect(result.isActive).toBe(true);
    expect(result.name).toBe('Test User');
    expect(result.email).toBe('test@example.com');
    expect(result.stripeCustomerId).toBe('cus_test123');
    expect(result.tierDetails).toEqual({
      rateLimit: 10,
      monthlyCredits: 50,
      price: 0,
    });
    expect(result.usage).toEqual(expect.objectContaining({
      tier: 'free',
      used: 5,
      limit: 50,
      remaining: 45,
    }));
    expect(getUsageStats).toHaveBeenCalledWith('ts_free_abcdef1234567890ab', 'free');
  });

  it('returns isActive=false for inactive API key', async () => {
    firestoreMock.collections.customers._store.set('test@example.com', {
      email: 'test@example.com',
      name: 'Test User',
      apiKeyId: 'ts_free_revoked1234567890ab',
      tier: 'free',
    });
    firestoreMock.collections.apiKeys._store.set('ts_free_revoked1234567890ab', {
      active: false,
      tier: 'free',
    });

    const result = await getDashboardData('test@example.com');

    expect(result.isActive).toBe(false);
  });

  it('returns isActive=false when API key doc does not exist', async () => {
    firestoreMock.collections.customers._store.set('test@example.com', {
      email: 'test@example.com',
      name: 'Test User',
      apiKeyId: 'ts_free_deleted1234567890ab',
      tier: 'free',
    });
    // No API key doc in Firestore

    const result = await getDashboardData('test@example.com');

    expect(result.isActive).toBe(false);
  });

  it('returns null stripeCustomerId when not set', async () => {
    firestoreMock.collections.customers._store.set('test@example.com', {
      email: 'test@example.com',
      name: 'Test User',
      apiKeyId: 'ts_free_nostripe1234567890ab',
      tier: 'free',
    });
    firestoreMock.collections.apiKeys._store.set('ts_free_nostripe1234567890ab', {
      active: true,
      tier: 'free',
    });

    const result = await getDashboardData('test@example.com');

    expect(result.stripeCustomerId).toBeNull();
  });

  it('uses correct tier details for pro tier', async () => {
    firestoreMock.collections.customers._store.set('pro@example.com', {
      email: 'pro@example.com',
      name: 'Pro User',
      apiKeyId: 'ts_pro_abcdef1234567890abcd',
      tier: 'pro',
    });
    firestoreMock.collections.apiKeys._store.set('ts_pro_abcdef1234567890abcd', {
      active: true,
      tier: 'pro',
    });

    const result = await getDashboardData('pro@example.com');

    expect(result.tierDetails).toEqual({
      rateLimit: 100,
      monthlyCredits: 1000,
      price: 9,
    });
  });
});
