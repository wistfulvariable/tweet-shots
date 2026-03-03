/**
 * Integration tests for screenshot routes (GET + POST /screenshot).
 * Uses real authenticate, billingGuard, and validate middleware with mocked Firestore.
 * Mocks core.mjs rendering functions to avoid real Twitter API / Satori calls.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import { createFirestoreMock } from '../helpers/firestore-mock.mjs';
import { TEST_CONFIG, MOCK_KEY_DATA, MOCK_API_KEY, MOCK_TWEET, currentMonth } from '../helpers/test-fixtures.mjs';
import { AppError } from '../../src/errors.mjs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mock = createFirestoreMock();

// Mock Firestore (used by authenticate → api-keys and billingGuard → usage)
vi.mock('../../src/services/firestore.mjs', () => ({
  apiKeysCollection: mock.apiKeysCollection,
  usageCollection: mock.usageCollection,
  customersCollection: mock.customersCollection,
  subscriptionsCollection: mock.subscriptionsCollection,
  FieldValue: mock.FieldValue,
}));

// Mock core.mjs — avoid real Twitter API and Satori rendering.
// Uses the REAL extractTweetId to prevent mock drift (audit recommendation #2).
let _realExtractTweetId;

vi.mock('../../core.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  _realExtractTweetId = actual.extractTweetId;
  return {
    ...actual,
    extractTweetId: vi.fn(actual.extractTweetId),
    fetchTweet: vi.fn(async () => structuredClone(MOCK_TWEET)),
    renderTweetToImage: vi.fn(async (tweet, opts = {}) => {
      const format = opts.format || 'png';
      return {
        data: Buffer.from(`fake-${format}-data`),
        format,
        contentType: format === 'svg' ? 'image/svg+xml' : 'image/png',
      };
    }),
  };
});

// Mock storage upload
vi.mock('../../src/services/storage.mjs', () => ({
  upload: vi.fn(async (bucket, filename) =>
    `https://storage.googleapis.com/${bucket}/${filename}`
  ),
}));

const { authenticate } = await import('../../src/middleware/authenticate.mjs');
const { billingGuard } = await import('../../src/middleware/billing-guard.mjs');
const { screenshotRoutes } = await import('../../src/routes/screenshot.mjs');
const { extractTweetId, fetchTweet, renderTweetToImage } = await import('../../core.mjs');
const { upload } = await import('../../src/services/storage.mjs');

// ─── Test Setup ──────────────────────────────────────────────────────────────

const mockLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

// Passthrough rate limiter (no real rate limiting in tests)
const passthroughRateLimit = (req, res, next) => next();

let app, server, baseUrl;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(screenshotRoutes({
    authenticate: authenticate(mockLogger),
    applyRateLimit: passthroughRateLimit,
    billingGuard: billingGuard(mockLogger),
    renderPool: null, // falls back to direct renderTweetToImage (mocked)
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
  vi.clearAllMocks();

  // Re-set default mock implementations after clearAllMocks
  extractTweetId.mockImplementation(_realExtractTweetId);
  fetchTweet.mockImplementation(async () => structuredClone(MOCK_TWEET));
  renderTweetToImage.mockImplementation(async (tweet, opts = {}) => {
    const format = opts.format || 'png';
    return {
      data: Buffer.from(`fake-${format}-data`),
      format,
      contentType: format === 'svg' ? 'image/svg+xml' : 'image/png',
    };
  });
  upload.mockImplementation(async (bucket, filename) =>
    `https://storage.googleapis.com/${bucket}/${filename}`
  );

  // Seed a valid API key in mock Firestore
  mock.collections.apiKeys._store.set(MOCK_API_KEY, { ...MOCK_KEY_DATA });
  // Seed usage doc so billingGuard can track
  mock.collections.usage._store.set(MOCK_API_KEY, {
    total: 0,
    currentMonth: currentMonth(),
    currentMonthCount: 0,
    lastUsed: null,
  });
});

// ─── GET /screenshot/:tweetIdOrUrl ───────────────────────────────────────────

describe('GET /screenshot/:tweetIdOrUrl', () => {
  it('returns 401 without API key', async () => {
    const res = await fetch(`${baseUrl}/screenshot/1234567890`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('MISSING_API_KEY');
  });

  it('returns PNG image with correct Content-Type', async () => {
    const res = await fetch(`${baseUrl}/screenshot/1234567890`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
  });

  it('sets X-Tweet-ID and X-Tweet-Author headers', async () => {
    const res = await fetch(`${baseUrl}/screenshot/1234567890`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.headers.get('x-tweet-id')).toBe('1234567890');
    expect(res.headers.get('x-tweet-author')).toBe('testuser');
  });

  it('calls renderTweetToImage with default options', async () => {
    await fetch(`${baseUrl}/screenshot/1234567890`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.objectContaining({ text: MOCK_TWEET.text }),
      expect.objectContaining({
        theme: 'dark',
        format: 'png',
        scale: 1,
        width: 550,
      })
    );
  });

  it('respects query params for render options', async () => {
    await fetch(`${baseUrl}/screenshot/1234567890?theme=light&format=svg&scale=2`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        theme: 'light',
        format: 'svg',
        scale: 2,
      })
    );
  });

  it('returns 400 for invalid tweet ID', async () => {
    extractTweetId.mockImplementation(() => {
      throw new AppError('Could not extract tweet ID');
    });
    const res = await fetch(`${baseUrl}/screenshot/not-a-tweet`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('SCREENSHOT_FAILED');
  });

  it('returns 400 when tweet fetch fails', async () => {
    fetchTweet.mockRejectedValue(new AppError('Failed to fetch tweet: 404'));
    const res = await fetch(`${baseUrl}/screenshot/999999`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('SCREENSHOT_FAILED');
  });

  it('applies gradient from query param', async () => {
    await fetch(`${baseUrl}/screenshot/1234567890?gradient=sunset`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ backgroundGradient: 'sunset' })
    );
  });

  it('applies hex color params', async () => {
    await fetch(
      `${baseUrl}/screenshot/1234567890?bgColor=%23ff0000&textColor=%23ffffff&linkColor=%2300ff00`,
      { headers: { 'X-API-KEY': MOCK_API_KEY } }
    );
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        backgroundColor: '#ff0000',
        textColor: '#ffffff',
        linkColor: '#00ff00',
      })
    );
  });

  it('handles boolean query string params', async () => {
    await fetch(`${baseUrl}/screenshot/1234567890?hideMetrics=true&hideMedia=true`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        showMetrics: false,
        hideMedia: true,
      })
    );
  });

  it('returns validation error for invalid scale', async () => {
    const res = await fetch(`${baseUrl}/screenshot/1234567890?scale=5`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns validation error for invalid hex color', async () => {
    const res = await fetch(`${baseUrl}/screenshot/1234567890?bgColor=notacolor`, {
      headers: { 'X-API-KEY': MOCK_API_KEY },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});

// ─── POST /screenshot ────────────────────────────────────────────────────────

describe('POST /screenshot', () => {
  function postScreenshot(body, apiKey = MOCK_API_KEY) {
    return fetch(`${baseUrl}/screenshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-API-KEY': apiKey } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 without API key', async () => {
    const res = await postScreenshot({ tweetId: '123' }, null);
    expect(res.status).toBe(401);
  });

  it('returns image binary by default', async () => {
    const res = await postScreenshot({ tweetId: '1234567890' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');

    const body = await res.arrayBuffer();
    expect(Buffer.from(body).toString()).toBe('fake-png-data');
  });

  it('returns base64 JSON when response is base64', async () => {
    const res = await postScreenshot({ tweetId: '1234567890', response: 'base64' });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tweetId).toBe('1234567890');
    expect(body.author).toBe('testuser');
    expect(body.format).toBe('png');
    expect(body.data).toBe(Buffer.from('fake-png-data').toString('base64'));
  });

  it('returns URL JSON when response is url', async () => {
    const res = await postScreenshot({ tweetId: '1234567890', response: 'url' });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.url).toContain('https://storage.googleapis.com/');
    expect(body.tweetId).toBe('1234567890');
    expect(upload).toHaveBeenCalled();
  });

  it('returns error when url response but no GCS bucket', async () => {
    const originalBucket = TEST_CONFIG.GCS_BUCKET;
    TEST_CONFIG.GCS_BUCKET = undefined;
    try {
      const res = await postScreenshot({ tweetId: '1234567890', response: 'url' });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.code).toBe('URL_NOT_CONFIGURED');
    } finally {
      TEST_CONFIG.GCS_BUCKET = originalBucket;
    }
  });

  it('accepts tweetId parameter', async () => {
    const res = await postScreenshot({ tweetId: '1234567890' });
    expect(res.status).toBe(200);
    expect(extractTweetId).toHaveBeenCalledWith('1234567890');
  });

  it('accepts tweetUrl parameter', async () => {
    const res = await postScreenshot({ tweetUrl: 'https://x.com/user/status/9876543210' });
    expect(res.status).toBe(200);
    expect(extractTweetId).toHaveBeenCalledWith('https://x.com/user/status/9876543210');
  });

  it('returns validation error when neither tweetId nor tweetUrl provided', async () => {
    const res = await postScreenshot({ theme: 'dark' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('applies render options from body', async () => {
    await postScreenshot({
      tweetId: '1234567890',
      theme: 'light',
      format: 'svg',
      scale: 3,
      gradient: 'ocean',
      hideMetrics: true,
    });
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        theme: 'light',
        format: 'svg',
        scale: 3,
        backgroundGradient: 'ocean',
      })
    );
  });

  it('returns 500 when rendering fails (internal error)', async () => {
    renderTweetToImage.mockRejectedValue(new Error('Render crashed'));
    const res = await postScreenshot({ tweetId: '1234567890' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('SCREENSHOT_FAILED');
    expect(body.error).toBe('Internal server error');
  });

  it('handles dimension presets', async () => {
    await postScreenshot({
      tweetId: '1234567890',
      dimension: 'instagramFeed',
    });
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ width: 1080 })
    );
  });

  it('sets correct Content-Type for SVG format', async () => {
    const res = await postScreenshot({ tweetId: '1234567890', format: 'svg' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
  });
});
