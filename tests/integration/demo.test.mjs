/**
 * Integration tests for demo screenshot route (GET /demo/screenshot/:tweetIdOrUrl).
 * Public route — no Firestore mocks needed (no auth, no billing).
 * Mocks tweet-fetch.mjs and tweet-render.mjs to avoid real Twitter API / Satori calls.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import { MOCK_TWEET } from '../helpers/test-fixtures.mjs';
import { AppError } from '../../src/errors.mjs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock tweet-fetch.mjs — keep real extractTweetId to prevent mock drift
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

const { demoRoutes } = await import('../../src/routes/demo.mjs');
const { extractTweetId, fetchTweet } = await import('../../tweet-fetch.mjs');
const { renderTweetToImage } = await import('../../tweet-render.mjs');

// ─── Test Setup ──────────────────────────────────────────────────────────────

const mockLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

// Passthrough rate limiter (no real rate limiting in tests)
const passthroughRateLimit = (req, res, next) => next();

let app, server, baseUrl;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(demoRoutes({
    demoRateLimit: passthroughRateLimit,
    renderPool: null,
    logger: mockLogger,
  }));

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  vi.clearAllMocks();

  // Restore default mock implementations after clearAllMocks
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
});

// ─── GET /demo/screenshot/:tweetIdOrUrl ──────────────────────────────────────

describe('GET /demo/screenshot/:tweetIdOrUrl', () => {
  // ── Happy path ──────────────────────────────────────────────────────────

  it('returns 200 with image/png content type for valid tweet ID', async () => {
    const res = await fetch(`${baseUrl}/demo/screenshot/1234567890`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');

    const body = await res.arrayBuffer();
    expect(Buffer.from(body).toString()).toBe('fake-png-data');
  });

  it('sets X-Tweet-ID response header', async () => {
    const res = await fetch(`${baseUrl}/demo/screenshot/1234567890`);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-tweet-id')).toBe('1234567890');
  });

  it('sets Cache-Control header with max-age=300', async () => {
    const res = await fetch(`${baseUrl}/demo/screenshot/1234567890`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300');
  });

  it('does NOT require API key (no X-API-KEY header needed)', async () => {
    // No auth headers sent — should still succeed
    const res = await fetch(`${baseUrl}/demo/screenshot/1234567890`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/png');
  });

  // ── Default render options ──────────────────────────────────────────────

  it('calls renderTweetToImage with default options (theme=dark, format=png, scale=2, width=550)', async () => {
    await fetch(`${baseUrl}/demo/screenshot/1234567890`);
    expect(renderTweetToImage).toHaveBeenCalledOnce();
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.objectContaining({ text: MOCK_TWEET.text }),
      expect.objectContaining({
        theme: 'dark',
        format: 'png',
        scale: 2,
        width: 550,
        showMetrics: true,
        hideMedia: false,
        hideDate: false,
        hideVerified: false,
        hideQuoteTweet: false,
        hideShadow: false,
        showUrl: false,
        padding: 20,
        borderRadius: 16,
      })
    );
  });

  // ── Query param: theme ──────────────────────────────────────────────────

  it('respects ?theme=light query param', async () => {
    await fetch(`${baseUrl}/demo/screenshot/1234567890?theme=light`);
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ theme: 'light' })
    );
  });

  // ── Query param: gradient ───────────────────────────────────────────────

  it('respects ?gradient=ocean query param', async () => {
    await fetch(`${baseUrl}/demo/screenshot/1234567890?gradient=ocean`);
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ backgroundGradient: 'ocean' })
    );
  });

  // ── Query param: dimension ──────────────────────────────────────────────

  it('respects ?dimension=instagramFeed query param (card=550, canvas=1080x1080)', async () => {
    await fetch(`${baseUrl}/demo/screenshot/1234567890?dimension=instagramFeed`);
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ width: 550, canvasWidth: 1080, canvasHeight: 1080 })
    );
  });

  // ── Boolean toggle params ──────────────────────────────────────────────

  it('respects hideMetrics=true (sets showMetrics: false)', async () => {
    await fetch(`${baseUrl}/demo/screenshot/1234567890?hideMetrics=true`);
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ showMetrics: false })
    );
  });

  it('respects hideMedia=true', async () => {
    await fetch(`${baseUrl}/demo/screenshot/1234567890?hideMedia=true`);
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hideMedia: true })
    );
  });

  it('respects hideDate=true', async () => {
    await fetch(`${baseUrl}/demo/screenshot/1234567890?hideDate=true`);
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hideDate: true })
    );
  });

  it('respects hideVerified=true', async () => {
    await fetch(`${baseUrl}/demo/screenshot/1234567890?hideVerified=true`);
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hideVerified: true })
    );
  });

  it('respects hideQuoteTweet=true', async () => {
    await fetch(`${baseUrl}/demo/screenshot/1234567890?hideQuoteTweet=true`);
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hideQuoteTweet: true })
    );
  });

  it('respects hideShadow=true', async () => {
    await fetch(`${baseUrl}/demo/screenshot/1234567890?hideShadow=true`);
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ hideShadow: true })
    );
  });

  it('respects showUrl=true and passes tweetId', async () => {
    await fetch(`${baseUrl}/demo/screenshot/1234567890?showUrl=true`);
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ showUrl: true, tweetId: '1234567890' })
    );
  });

  it('respects multiple boolean toggles at once', async () => {
    await fetch(`${baseUrl}/demo/screenshot/1234567890?hideMetrics=true&hideMedia=true&hideShadow=true`);
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        showMetrics: false,
        hideMedia: true,
        hideShadow: true,
      })
    );
  });

  // ── Always PNG ──────────────────────────────────────────────────────────

  it('always renders as PNG regardless of format query param (format stripped by validation)', async () => {
    // demoQuerySchema does not include format — unknown params are stripped by Zod
    const res = await fetch(`${baseUrl}/demo/screenshot/1234567890?format=svg`);
    expect(res.status).toBe(200);
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ format: 'png' })
    );
    expect(res.headers.get('content-type')).toContain('image/png');
  });

  // ── URL-encoded tweet URL as path param ─────────────────────────────────

  it('accepts URL-encoded tweet URL as path param', async () => {
    const tweetUrl = encodeURIComponent('https://x.com/user/status/9876543210');
    const res = await fetch(`${baseUrl}/demo/screenshot/${tweetUrl}`);
    expect(res.status).toBe(200);
    expect(extractTweetId).toHaveBeenCalledWith('https://x.com/user/status/9876543210');
    expect(res.headers.get('x-tweet-id')).toBe('9876543210');
  });

  // ── Error handling ─────────────────────────────────────────────────────

  it('returns 400 for invalid tweet ID', async () => {
    extractTweetId.mockImplementation(() => {
      throw new AppError('Could not extract tweet ID');
    });
    const res = await fetch(`${baseUrl}/demo/screenshot/not-a-tweet`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('DEMO_SCREENSHOT_FAILED');
    expect(body.error).toBe('Could not extract tweet ID');
  });

  it('returns 400 when fetchTweet fails with AppError', async () => {
    fetchTweet.mockRejectedValue(new AppError('Failed to fetch tweet: 404'));
    const res = await fetch(`${baseUrl}/demo/screenshot/1234567890`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('DEMO_SCREENSHOT_FAILED');
    expect(body.error).toBe('Failed to fetch tweet: 404');
  });

  it('returns 500 when renderTweetToImage throws a plain Error (generic error message)', async () => {
    renderTweetToImage.mockRejectedValue(new Error('Satori crashed'));
    const res = await fetch(`${baseUrl}/demo/screenshot/1234567890`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('DEMO_SCREENSHOT_FAILED');
    // Generic message — raw error not leaked to client
    expect(body.error).toBe('An unexpected error occurred. Please try again later.');
  });

  it('returns 504 with helpful message when render times out', async () => {
    renderTweetToImage.mockRejectedValue(new Error('Render timed out after 30s'));
    const res = await fetch(`${baseUrl}/demo/screenshot/1234567890`);
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.code).toBe('RENDER_TIMEOUT');
    expect(body.error).toContain('Hide media');
  });

  it('logs a warning when demo screenshot fails', async () => {
    fetchTweet.mockRejectedValue(new AppError('Tweet not found', 404));
    await fetch(`${baseUrl}/demo/screenshot/1234567890`);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ tweetIdOrUrl: '1234567890' }),
      'Demo screenshot failed'
    );
  });

  // ── Validation errors ──────────────────────────────────────────────────

  it('returns 400 for invalid theme query param', async () => {
    const res = await fetch(`${baseUrl}/demo/screenshot/1234567890?theme=invalid`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid dimension query param', async () => {
    const res = await fetch(`${baseUrl}/demo/screenshot/1234567890?dimension=invalid`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid gradient query param', async () => {
    const res = await fetch(`${baseUrl}/demo/screenshot/1234567890?gradient=invalid`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for out-of-range padding', async () => {
    const res = await fetch(`${baseUrl}/demo/screenshot/1234567890?padding=999`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for out-of-range radius', async () => {
    const res = await fetch(`${baseUrl}/demo/screenshot/1234567890?radius=-5`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // ── Padding / radius ───────────────────────────────────────────────────

  it('respects custom padding query param', async () => {
    await fetch(`${baseUrl}/demo/screenshot/1234567890?padding=50`);
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ padding: 50 })
    );
  });

  it('respects custom radius query param', async () => {
    await fetch(`${baseUrl}/demo/screenshot/1234567890?radius=0`);
    expect(renderTweetToImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ borderRadius: 0 })
    );
  });
});
