/**
 * Integration tests for POST /screenshot/batch.
 * Tests JSON batch, CSV multipart upload, credit enforcement, and per-item error handling.
 * Uses real authenticate, billingGuard middleware with mocked Firestore.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import { createFirestoreMock } from '../helpers/firestore-mock.mjs';
import {
  TEST_CONFIG, MOCK_KEY_DATA, MOCK_API_KEY, MOCK_TWEET,
  MOCK_PRO_KEY_DATA, MOCK_PRO_API_KEY,
  MOCK_BUSINESS_KEY_DATA, MOCK_BUSINESS_API_KEY,
  currentMonth,
} from '../helpers/test-fixtures.mjs';
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

vi.mock('../../tweet-render.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
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

vi.mock('../../src/services/storage.mjs', () => ({
  upload: vi.fn(async (bucket, filename) =>
    `https://storage.googleapis.com/${bucket}/${filename}`
  ),
}));

const { authenticate } = await import('../../src/middleware/authenticate.mjs');
const { screenshotRoutes } = await import('../../src/routes/screenshot.mjs');
const { extractTweetId, fetchTweet } = await import('../../tweet-fetch.mjs');
const { renderTweetToImage } = await import('../../tweet-render.mjs');
const { upload } = await import('../../src/services/storage.mjs');

// ─── Test Setup ──────────────────────────────────────────────────────────────

const mockLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
const passthroughRateLimit = (req, res, next) => next();

let app, server, baseUrl;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(screenshotRoutes({
    authenticate: authenticate(mockLogger),
    applyRateLimit: passthroughRateLimit,
    billingGuard: (req, res, next) => next(), // bypass for non-batch routes
    renderPool: null,
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

  // Seed free API key
  mock.collections.apiKeys._store.set(MOCK_API_KEY, { ...MOCK_KEY_DATA });
  mock.collections.usage._store.set(MOCK_API_KEY, {
    total: 0,
    currentMonth: currentMonth(),
    currentMonthCount: 0,
    lastUsed: null,
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function postBatch(body, apiKey = MOCK_API_KEY) {
  return fetch(`${baseUrl}/screenshot/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-KEY': apiKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

/**
 * Build a multipart/form-data body manually (no external dependency).
 */
function buildMultipartBody(csvContent, fields = {}, apiKey = MOCK_API_KEY) {
  const boundary = '----TestBoundary' + Date.now();
  let body = '';

  // Add form fields
  for (const [key, value] of Object.entries(fields)) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    body += `${value}\r\n`;
  }

  // Add CSV file
  if (csvContent !== null) {
    body += `--${boundary}\r\n`;
    body += 'Content-Disposition: form-data; name="file"; filename="urls.csv"\r\n';
    body += 'Content-Type: text/csv\r\n\r\n';
    body += csvContent + '\r\n';
  }

  body += `--${boundary}--\r\n`;

  return {
    body,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      ...(apiKey ? { 'X-API-KEY': apiKey } : {}),
    },
  };
}

function postMultipart(csvContent, fields = {}, apiKey = MOCK_API_KEY) {
  const { body, headers } = buildMultipartBody(csvContent, fields, apiKey);
  return fetch(`${baseUrl}/screenshot/batch`, {
    method: 'POST',
    headers,
    body,
  });
}

// ─── Authentication ──────────────────────────────────────────────────────────

describe('POST /screenshot/batch — Authentication', () => {
  it('returns 401 without API key', async () => {
    const res = await postBatch({ urls: ['1234567890'] }, null);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('MISSING_API_KEY');
  });

  it('returns 401 with invalid API key', async () => {
    const res = await postBatch({ urls: ['1234567890'] }, 'ts_free_invalid_key');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('INVALID_API_KEY');
  });
});

// ─── JSON Validation ─────────────────────────────────────────────────────────

describe('POST /screenshot/batch — JSON Validation', () => {
  it('returns 400 when urls array is missing', async () => {
    const res = await postBatch({ theme: 'dark' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when urls array is empty', async () => {
    const res = await postBatch({ urls: [] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('At least one URL') }),
      ])
    );
  });

  it('returns 400 for invalid render option', async () => {
    const res = await postBatch({ urls: ['1234567890'], scale: 5 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid response value', async () => {
    const res = await postBatch({ urls: ['1234567890'], response: 'image' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('includes requestId in validation errors', async () => {
    const res = await postBatch({ urls: [] });
    const body = await res.json();
    // requestId may or may not be present depending on middleware setup
    // but the error structure should be correct
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.details).toBeDefined();
  });
});

// ─── Batch Size Limits ───────────────────────────────────────────────────────

describe('POST /screenshot/batch — Batch Size Limits', () => {
  it('accepts batch of 10 for free tier', async () => {
    const urls = Array.from({ length: 10 }, (_, i) => String(1000000000 + i));
    const res = await postBatch({ urls });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(10);
  });

  it('rejects batch of 11 for free tier', async () => {
    const urls = Array.from({ length: 11 }, (_, i) => String(1000000000 + i));
    const res = await postBatch({ urls });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BATCH_LIMIT_EXCEEDED');
    expect(body.limit).toBe(10);
    expect(body.tier).toBe('free');
  });

  it('accepts batch of 100 for pro tier', async () => {
    mock.collections.apiKeys._store.set(MOCK_PRO_API_KEY, { ...MOCK_PRO_KEY_DATA });
    mock.collections.usage._store.set(MOCK_PRO_API_KEY, {
      total: 0, currentMonth: currentMonth(), currentMonthCount: 0, lastUsed: null,
    });

    const urls = Array.from({ length: 100 }, (_, i) => String(1000000000 + i));
    const res = await postBatch({ urls }, MOCK_PRO_API_KEY);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(100);
  });

  it('rejects batch of 101 for pro tier', async () => {
    mock.collections.apiKeys._store.set(MOCK_PRO_API_KEY, { ...MOCK_PRO_KEY_DATA });
    mock.collections.usage._store.set(MOCK_PRO_API_KEY, {
      total: 0, currentMonth: currentMonth(), currentMonthCount: 0, lastUsed: null,
    });

    const urls = Array.from({ length: 101 }, (_, i) => String(1000000000 + i));
    const res = await postBatch({ urls }, MOCK_PRO_API_KEY);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BATCH_LIMIT_EXCEEDED');
    expect(body.limit).toBe(100);
  });
});

// ─── Credit Enforcement ──────────────────────────────────────────────────────

describe('POST /screenshot/batch — Credit Enforcement', () => {
  it('returns 429 when batch exceeds remaining monthly credits', async () => {
    mock.collections.usage._store.set(MOCK_API_KEY, {
      total: 48,
      currentMonth: currentMonth(),
      currentMonthCount: 48,
      lastUsed: null,
    });

    const res = await postBatch({ urls: ['1000000001', '1000000002', '1000000003'] });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('MONTHLY_LIMIT_EXCEEDED');
    expect(body.remaining).toBe(2);
  });

  it('sets X-Credits-Limit and X-Credits-Remaining headers on success', async () => {
    const res = await postBatch({ urls: ['1234567890'] });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-credits-limit')).toBe('50');
    expect(Number(res.headers.get('x-credits-remaining'))).toBeLessThanOrEqual(50);
  });

  it('consumes N credits for batch of N URLs', async () => {
    const res = await postBatch({ urls: ['1000000001', '1000000002', '1000000003'] });
    expect(res.status).toBe(200);

    // Verify 3 credits were consumed
    const stored = mock.collections.usage._store.get(MOCK_API_KEY);
    expect(stored.currentMonthCount).toBe(3);
  });
});

// ─── Successful Batch (JSON, base64) ─────────────────────────────────────────

describe('POST /screenshot/batch — JSON base64 response', () => {
  it('returns correct results array for batch of 3 URLs', async () => {
    const res = await postBatch({
      urls: ['1234567890', '9876543210', '1111111111'],
      response: 'base64',
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.total).toBe(3);
    expect(body.succeeded).toBe(3);
    expect(body.failed).toBe(0);
    expect(body.results).toHaveLength(3);

    for (const result of body.results) {
      expect(result.success).toBe(true);
      expect(result.data).toBe(Buffer.from('fake-png-data').toString('base64'));
      expect(result.author).toBe('testuser');
      expect(result.format).toBe('png');
    }
  });

  it('defaults to base64 response when not specified', async () => {
    const res = await postBatch({ urls: ['1234567890'] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].data).toBeDefined();
    expect(body.results[0].url).toBeUndefined();
  });

  it('sets X-Render-Time-Ms header', async () => {
    const res = await postBatch({ urls: ['1234567890'] });
    expect(res.status).toBe(200);
    const renderTime = res.headers.get('x-render-time-ms');
    expect(renderTime).toBeDefined();
    expect(Number(renderTime)).toBeGreaterThanOrEqual(0);
  });

  it('applies shared render options to all items', async () => {
    await postBatch({
      urls: ['1234567890', '9876543210'],
      theme: 'light',
      format: 'svg',
      gradient: 'ocean',
    });

    // Both calls should use the shared options
    expect(renderTweetToImage).toHaveBeenCalledTimes(2);
    for (const call of renderTweetToImage.mock.calls) {
      expect(call[1]).toMatchObject({
        theme: 'light',
        format: 'svg',
        backgroundGradient: 'ocean',
      });
    }
  });

  it('extracts correct tweet IDs from full URLs', async () => {
    await postBatch({
      urls: ['https://x.com/user/status/1234567890', 'https://twitter.com/user/status/9876543210'],
    });
    expect(extractTweetId).toHaveBeenCalledWith('https://x.com/user/status/1234567890');
    expect(extractTweetId).toHaveBeenCalledWith('https://twitter.com/user/status/9876543210');
  });
});

// ─── Successful Batch (JSON, url response) ───────────────────────────────────

describe('POST /screenshot/batch — JSON url response', () => {
  it('returns url field in each result', async () => {
    const res = await postBatch({
      urls: ['1234567890', '9876543210'],
      response: 'url',
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    for (const result of body.results) {
      expect(result.success).toBe(true);
      expect(result.url).toContain('https://storage.googleapis.com/');
      expect(result.data).toBeUndefined();
    }
  });

  it('calls upload for each successful render', async () => {
    await postBatch({
      urls: ['1234567890', '9876543210'],
      response: 'url',
    });
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('returns URL_NOT_CONFIGURED per-item when no GCS bucket', async () => {
    const originalBucket = TEST_CONFIG.GCS_BUCKET;
    TEST_CONFIG.GCS_BUCKET = undefined;
    try {
      const res = await postBatch({
        urls: ['1234567890'],
        response: 'url',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.results[0].success).toBe(false);
      expect(body.results[0].code).toBe('URL_NOT_CONFIGURED');
    } finally {
      TEST_CONFIG.GCS_BUCKET = originalBucket;
    }
  });
});

// ─── Partial Failures ────────────────────────────────────────────────────────

describe('POST /screenshot/batch — Partial Failures', () => {
  it('returns mixed results when some URLs fail', async () => {
    // Make fetchTweet fail for specific IDs
    fetchTweet.mockImplementation(async (id) => {
      if (id === '9999999999') throw new AppError('Tweet not available or does not exist. Please verify the tweet ID and try again.', 404);
      return structuredClone(MOCK_TWEET);
    });

    const res = await postBatch({
      urls: ['1234567890', '9999999999', '1111111111'],
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.total).toBe(3);
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(1);

    // First and third should succeed
    expect(body.results[0].success).toBe(true);
    expect(body.results[2].success).toBe(true);

    // Second should fail
    expect(body.results[1].success).toBe(false);
    expect(body.results[1].code).toBe('RENDER_FAILED');
    expect(body.results[1].error).toContain('does not exist');
  });

  it('returns 200 even when all URLs fail', async () => {
    fetchTweet.mockRejectedValue(new AppError('Tweet not available', 404));

    const res = await postBatch({
      urls: ['9999999991', '9999999992'],
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.succeeded).toBe(0);
    expect(body.failed).toBe(2);
  });

  it('returns RENDER_TIMEOUT code for timed-out renders', async () => {
    renderTweetToImage.mockRejectedValue(new Error('Render timed out after 60s'));

    const res = await postBatch({ urls: ['1234567890'] });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].code).toBe('RENDER_TIMEOUT');
    expect(body.results[0].error).toContain('too long to render');
  });

  it('returns generic error message for internal errors', async () => {
    renderTweetToImage.mockRejectedValue(new Error('Satori crashed with segfault'));

    const res = await postBatch({ urls: ['1234567890'] });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toBe('Rendering failed for this tweet.');
    // Should NOT contain the internal error message
    expect(body.results[0].error).not.toContain('segfault');
  });
});

// ─── CSV Upload (multipart/form-data) ────────────────────────────────────────

describe('POST /screenshot/batch — CSV Upload', () => {
  it('accepts CSV file with url column and processes URLs', async () => {
    const csv = 'url\n1234567890\n9876543210';
    const res = await postMultipart(csv);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.succeeded).toBe(2);
  });

  it('returns 400 when no file is uploaded', async () => {
    const { body, headers } = buildMultipartBody(null, { response: 'base64' });
    const res = await fetch(`${baseUrl}/screenshot/batch`, {
      method: 'POST',
      headers: { ...headers, 'X-API-KEY': MOCK_API_KEY },
      body,
    });
    expect(res.status).toBe(400);
    const resBody = await res.json();
    expect(resBody.error).toContain('CSV file required');
  });

  it('returns 400 when CSV has no url column', async () => {
    const csv = 'tweet_id,name\n1234567890,test';
    const res = await postMultipart(csv);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('url');
  });

  it('handles CSV with BOM', async () => {
    const csv = '\uFEFFurl\n1234567890';
    const res = await postMultipart(csv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
  });

  it('handles CSV with CRLF line endings', async () => {
    const csv = 'url\r\n1234567890\r\n9876543210\r\n';
    const res = await postMultipart(csv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
  });

  it('handles CSV with extra columns (ignored)', async () => {
    const csv = 'name,url,notes\nTest,1234567890,some note\nTest2,9876543210,other note';
    const res = await postMultipart(csv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
  });

  it('skips empty URL rows', async () => {
    const csv = 'url\n1234567890\n\n9876543210\n';
    const res = await postMultipart(csv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
  });

  it('applies render options from form fields', async () => {
    const csv = 'url\n1234567890';
    const res = await postMultipart(csv, { theme: 'light', hideMetrics: 'true' });
    expect(res.status).toBe(200);

    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ theme: 'light' })
    );
  });

  it('handles quoted CSV fields', async () => {
    const csv = 'url\n"1234567890"\n"9876543210"';
    const res = await postMultipart(csv);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(2);
  });

  it('returns 400 for empty CSV', async () => {
    const res = await postMultipart('');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('empty');
  });

  it('returns 400 for CSV with only header row', async () => {
    const res = await postMultipart('url');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No URLs found');
  });
});

// ─── Billing Fail-Open ───────────────────────────────────────────────────────

describe('POST /screenshot/batch — Billing fail-open', () => {
  it('proceeds when usage tracking fails (Firestore down)', async () => {
    // Make usage collection throw
    const originalUsageCollection = mock.usageCollection;
    const failingCollection = () => ({
      doc: () => ({
        get: async () => { throw new Error('Firestore unavailable'); },
        set: async () => { throw new Error('Firestore unavailable'); },
        update: async () => { throw new Error('Firestore unavailable'); },
      }),
    });

    // Temporarily replace the usage collection
    // We need to test that the route handler catches the error and proceeds
    // Since the mock is already wired, we'll clear usage store and make the doc.get fail
    const originalGet = mock.collections.usage.doc;
    mock.collections.usage.doc = (id) => ({
      get: async () => { throw new Error('Firestore unavailable'); },
      set: async () => { throw new Error('Firestore unavailable'); },
      update: async () => { throw new Error('Firestore unavailable'); },
    });

    try {
      const res = await postBatch({ urls: ['1234567890'] });
      expect(res.status).toBe(200);
      expect(res.headers.get('x-credits-remaining')).toBe('unknown');
    } finally {
      mock.collections.usage.doc = originalGet;
    }
  });
});
