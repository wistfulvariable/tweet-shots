/**
 * Unit tests for API key CRUD service.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFirestoreMock } from '../helpers/firestore-mock.mjs';

// Mock firestore before importing the module under test
const mock = createFirestoreMock();

vi.mock('../../src/services/firestore.mjs', () => ({
  apiKeysCollection: mock.apiKeysCollection,
  usageCollection: mock.usageCollection,
  customersCollection: mock.customersCollection,
  subscriptionsCollection: mock.subscriptionsCollection,
  FieldValue: mock.FieldValue,
}));

const {
  generateKeyString,
  createApiKey,
  validateApiKey,
  revokeApiKey,
  listApiKeys,
  updateApiKeyTier,
} = await import('../../src/services/api-keys.mjs');

describe('generateKeyString', () => {
  it('generates key with ts_ prefix and tier', () => {
    const key = generateKeyString('free');
    expect(key).toMatch(/^ts_free_[a-f0-9]{32}$/);
  });

  it('generates key for pro tier', () => {
    const key = generateKeyString('pro');
    expect(key).toMatch(/^ts_pro_[a-f0-9]{32}$/);
  });

  it('generates key for business tier', () => {
    const key = generateKeyString('business');
    expect(key).toMatch(/^ts_business_[a-f0-9]{32}$/);
  });

  it('throws on invalid tier', () => {
    expect(() => generateKeyString('enterprise')).toThrow('Invalid tier');
  });

  it('generates unique keys', () => {
    const keys = new Set(Array.from({ length: 10 }, () => generateKeyString('free')));
    expect(keys.size).toBe(10);
  });
});

describe('createApiKey', () => {
  beforeEach(() => {
    mock.collections.apiKeys._store.clear();
  });

  it('creates a key and stores it in Firestore', async () => {
    const result = await createApiKey({ tier: 'free', name: 'Test Key' });
    expect(result.keyString).toMatch(/^ts_free_/);
    expect(result.tier).toBe('free');
    expect(result.name).toBe('Test Key');

    // Verify stored in Firestore
    const doc = await mock.apiKeysCollection().doc(result.keyString).get();
    expect(doc.exists).toBe(true);
    expect(doc.data().tier).toBe('free');
    expect(doc.data().active).toBe(true);
  });

  it('defaults name to Unnamed', async () => {
    const result = await createApiKey({ tier: 'free' });
    expect(result.name).toBe('Unnamed');
  });

  it('stores email when provided', async () => {
    const result = await createApiKey({ tier: 'pro', email: 'test@example.com' });
    const doc = await mock.apiKeysCollection().doc(result.keyString).get();
    expect(doc.data().email).toBe('test@example.com');
  });
});

describe('validateApiKey', () => {
  beforeEach(() => {
    mock.collections.apiKeys._store.clear();
  });

  it('returns data for valid active key', async () => {
    const { keyString } = await createApiKey({ tier: 'free', name: 'Valid' });
    const result = await validateApiKey(keyString);
    expect(result).not.toBeNull();
    expect(result.tier).toBe('free');
    expect(result.active).toBe(true);
  });

  it('returns null for non-existent key', async () => {
    const result = await validateApiKey('ts_free_nonexistent');
    expect(result).toBeNull();
  });

  it('returns null for inactive key', async () => {
    const { keyString } = await createApiKey({ tier: 'free' });
    await revokeApiKey(keyString);
    const result = await validateApiKey(keyString);
    expect(result).toBeNull();
  });
});

describe('revokeApiKey', () => {
  beforeEach(() => {
    mock.collections.apiKeys._store.clear();
  });

  it('sets active to false', async () => {
    const { keyString } = await createApiKey({ tier: 'free' });
    const result = await revokeApiKey(keyString);
    expect(result).toBe(true);

    const doc = await mock.apiKeysCollection().doc(keyString).get();
    expect(doc.data().active).toBe(false);
  });

  it('returns false for non-existent key', async () => {
    const result = await revokeApiKey('ts_free_doesnotexist');
    expect(result).toBe(false);
  });
});

describe('listApiKeys', () => {
  beforeEach(() => {
    mock.collections.apiKeys._store.clear();
  });

  it('returns empty array when no keys', async () => {
    const keys = await listApiKeys();
    expect(keys).toEqual([]);
  });

  it('returns all keys with masked display', async () => {
    await createApiKey({ tier: 'free', name: 'Key 1' });
    await createApiKey({ tier: 'pro', name: 'Key 2' });

    const keys = await listApiKeys();
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(key.key).toMatch(/^ts_\w{4,}\.\.\.$/);
      expect(key._id).toBeDefined();
    }
  });
});

describe('updateApiKeyTier', () => {
  beforeEach(() => {
    mock.collections.apiKeys._store.clear();
  });

  it('updates tier without changing key string', async () => {
    const { keyString } = await createApiKey({ tier: 'free' });
    await updateApiKeyTier(keyString, 'pro');

    const doc = await mock.apiKeysCollection().doc(keyString).get();
    expect(doc.data().tier).toBe('pro');
  });

  it('throws on invalid tier', async () => {
    const { keyString } = await createApiKey({ tier: 'free' });
    await expect(updateApiKeyTier(keyString, 'ultra')).rejects.toThrow('Invalid tier');
  });
});
