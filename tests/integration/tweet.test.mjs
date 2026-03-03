/**
 * Integration tests for tweet data route (GET /tweet/:tweetIdOrUrl).
 * Uses real authenticate, billingGuard middleware with mocked Firestore and core.mjs.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import { createFirestoreMock } from '../helpers/firestore-mock.mjs';
import { TEST_CONFIG, MOCK_KEY_DATA, MOCK_API_KEY, MOCK_TWEET, currentMonth } from '../helpers/test-fixtures.mjs';
import { AppError } from '../../src/errors.mjs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mock = createFirestoreMock();

vi.mock('../../src/services/firestore.mjs', () => ({
  apiKeysCollection: mock.apiKeysCollection,
  usageCollection: mock.usageCollection,
  customersCollection: mock.customersCollection,
  subscriptionsCollection: mock.subscriptionsCollection,
  FieldValue: mock.FieldValue,
}));

// Uses the REAL extractTweetId to prevent mock drift (audit recommendation #2).
let _realExtractTweetId;

vi.mock('../../tweet-fetch.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  _realExtractTweetId = actual.extractTweetId;
  return {
    ...actual,
    extractTweetId: vi.fn(actual.extractTweetId),
    fetchTweet: vi.fn(async () => structuredClone(MOCK_TWEET)),
  };
});

const { authenticate } = await import('../../src/middleware/authenticate.mjs');
const { billingGuard } = await import('../../src/middleware/billing-guard.mjs');
const { tweetRoutes } = await import('../../src/routes/tweet.mjs');
const { extractTweetId, fetchTweet } = await import('../../tweet-fetch.mjs');

// ─── Test Setup ──────────────────────────────────────────────────────────────

const mockLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
const passthroughRateLimit = (req, res, next) => next();

let app, server, baseUrl;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(tweetRoutes({
    authenticate: authenticate(mockLogger),
    applyRateLimit: passthroughRateLimit,
    billingGuard: billingGuard(mockLogger),
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
  vi.clearAllMocks();

  // Restore default implementations
  extractTweetId.mockImplementation(_realExtractTweetId);
  fetchTweet.mockImplementation(async () => structuredClone(MOCK_TWEET));

  // Seed API key and usage
  mock.collections.apiKeys._store.set(MOCK_API_KEY, { ...MOCK_KEY_DATA });
  mock.collections.usage._store.set(MOCK_API_KEY, {
    total: 0, currentMonth: currentMonth(), currentMonthCount: 0, lastUsed: null,
  });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /tweet/:tweetIdOrUrl', () => {
  it('returns 401 without API key', async () => {
    const res = await fetch(`${baseUrl}/tweet/1234567890`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('MISSING_API_KEY');
  });

  it('returns tweet data for valid tweet ID', async () => {
    const res = await fetch(`${baseUrl}/tweet/1234567890`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tweetId).toBe('1234567890');
    expect(body.data.text).toBe(MOCK_TWEET.text);
    expect(body.data.user.screen_name).toBe('testuser');
  });

  it('extracts tweet ID from URL-encoded tweet URL', async () => {
    const encodedUrl = encodeURIComponent('https://x.com/user/status/9876543210');
    const res = await fetch(`${baseUrl}/tweet/${encodedUrl}`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.tweetId).toBe('9876543210');
    expect(extractTweetId).toHaveBeenCalledWith('https://x.com/user/status/9876543210');
  });

  it('returns 400 for invalid tweet ID', async () => {
    extractTweetId.mockImplementation(() => {
      throw new AppError('Could not extract tweet ID from: invalid');
    });

    const res = await fetch(`${baseUrl}/tweet/invalid`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.code).toBe('FETCH_FAILED');
    expect(body.error).toContain('Could not extract');
  });

  it('returns 400 when tweet fetch fails', async () => {
    fetchTweet.mockRejectedValue(new AppError('Failed to fetch tweet: 404'));

    const res = await fetch(`${baseUrl}/tweet/1234567890`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.code).toBe('FETCH_FAILED');
    expect(body.error).toContain('Failed to fetch tweet');
  });

  it('logs error when fetch fails', async () => {
    fetchTweet.mockRejectedValue(new Error('Network timeout'));

    await fetch(`${baseUrl}/tweet/1234567890`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ tweetIdOrUrl: '1234567890' }),
      'Tweet fetch failed'
    );
  });

  it('accepts API key via query param', async () => {
    const res = await fetch(`${baseUrl}/tweet/1234567890?apiKey=${MOCK_API_KEY}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 401 for invalid API key', async () => {
    const res = await fetch(`${baseUrl}/tweet/1234567890`, {
      headers: { 'X-API-KEY': 'ts_free_invalid_key_000000000' },
    });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.code).toBe('INVALID_API_KEY');
  });
});
