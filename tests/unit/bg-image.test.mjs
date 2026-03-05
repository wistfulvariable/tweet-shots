/**
 * Unit tests for background image support (Phase 4).
 * Tests fetchImageAsBuffer, compositeOnBackground, and bgImage wiring
 * in renderTweetToImage / renderThreadToImage.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_TWEET } from '../helpers/test-fixtures.mjs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(function () { return this; }),
}));

vi.mock('../../src/logger.mjs', () => ({
  createLogger: vi.fn(() => mockLogger),
}));

vi.mock('satori', () => ({
  default: vi.fn(async () => '<svg>mock</svg>'),
}));

vi.mock('@resvg/resvg-js', () => {
  const MockResvg = vi.fn(function () {
    this.render = () => ({ asPng: () => Buffer.from('fake-png-data') });
  });
  return { Resvg: MockResvg };
});

// Mock sharp — chainable API returning a buffer.
// We also track composite calls for verifying bgImage integration.
vi.mock('sharp', () => {
  const sharpInstance = {
    resize: vi.fn().mockReturnThis(),
    sharpen: vi.fn().mockReturnThis(),
    trim: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    composite: vi.fn().mockReturnThis(),
    toBuffer: vi.fn(async () => Buffer.from('ssaa-png-data')),
    metadata: vi.fn(async () => ({ width: 1100, height: 800 })),
  };
  const sharpFn = vi.fn(() => sharpInstance);
  sharpFn._instance = sharpInstance;
  return { default: sharpFn };
});

vi.mock('satori-html', () => ({
  html: vi.fn((input) => ({ type: 'div', props: { children: input } })),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => {
        const buf = Buffer.alloc(64);
        buf.write('wOFF', 0);
        return buf;
      }),
      writeFileSync: actual.writeFileSync,
      createWriteStream: actual.createWriteStream,
    },
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => {
      const buf = Buffer.alloc(64);
      buf.write('wOFF', 0);
      return buf;
    }),
  };
});

vi.mock('../../tweet-emoji.mjs', () => ({
  fetchEmoji: vi.fn(async () => 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='),
  emojiToCodepoint: vi.fn((emoji) => '1f600'),
  clearEmojiCache: vi.fn(),
  getEmojiCacheSize: vi.fn(() => 0),
}));

vi.mock('../../tweet-fonts.mjs', () => ({
  loadLanguageFont: vi.fn(() => undefined),
  getSupportedLanguages: vi.fn(() => ['ja-JP', 'ko-KR', 'zh-CN']),
  clearFontCache: vi.fn(),
}));

const sharpMod = await import('sharp');
const sharpFn = sharpMod.default;

const {
  fetchImageAsBuffer,
  fetchImageAsBase64,
  renderTweetToImage,
  renderThreadToImage,
} = await import('../../tweet-render.mjs');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cloneTweet(overrides = {}) {
  return structuredClone({ ...MOCK_TWEET, ...overrides });
}

function mockFetchResponse(body, { ok = true, status = 200, contentType = 'image/png' } = {}) {
  return {
    ok,
    status,
    arrayBuffer: async () => {
      if (body instanceof ArrayBuffer) return body;
      if (Buffer.isBuffer(body)) return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
      return new TextEncoder().encode(JSON.stringify(body)).buffer;
    },
    headers: {
      get: (name) => {
        if (name.toLowerCase() === 'content-type') return contentType;
        return null;
      },
    },
  };
}

// ─── fetchImageAsBuffer ──────────────────────────────────────────────────────

describe('fetchImageAsBuffer', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockLogger.error.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns a Buffer on success', async () => {
    const imageData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]); // PNG header
    globalThis.fetch = vi.fn(async () => mockFetchResponse(imageData));

    const result = await fetchImageAsBuffer('https://example.com/bg.png');
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns raw bytes (not base64 data URI)', async () => {
    const imageData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    globalThis.fetch = vi.fn(async () => mockFetchResponse(imageData));

    const result = await fetchImageAsBuffer('https://example.com/bg.png');
    // Should NOT start with 'data:' — that's fetchImageAsBase64 behavior
    const asString = result.toString('utf-8');
    expect(asString).not.toMatch(/^data:/);
  });

  it('returns null on non-OK HTTP response', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      headers: { get: () => null },
    }));

    const result = await fetchImageAsBuffer('https://example.com/missing.png');
    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 404 }),
      'Background image fetch failed'
    );
  });

  it('returns null on network error', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('connection refused'); });

    const result = await fetchImageAsBuffer('https://example.com/broken.png');
    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'connection refused' }),
      'Background image fetch error'
    );
  });

  it('returns null on timeout (AbortError)', async () => {
    globalThis.fetch = vi.fn(async (url, opts) => {
      return new Promise((resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });

    vi.useFakeTimers();
    const resultPromise = fetchImageAsBuffer('https://example.com/huge.png');
    vi.advanceTimersByTime(10_000);
    const result = await resultPromise;
    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'timed out' }),
      'Background image fetch error'
    );
    vi.useRealTimers();
  });

  it('truncates long URLs in log messages to 80 chars', async () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(200);
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      headers: { get: () => null },
    }));

    await fetchImageAsBuffer(longUrl);
    const loggedUrl = mockLogger.error.mock.calls[0][0].url;
    expect(loggedUrl.length).toBe(80);
  });

  it('preserves image bytes accurately', async () => {
    const rawBytes = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    globalThis.fetch = vi.fn(async () => mockFetchResponse(rawBytes));

    const result = await fetchImageAsBuffer('https://example.com/img.png');
    expect(result).toEqual(rawBytes);
  });
});

// ─── renderTweetToImage with bgImage ─────────────────────────────────────────

describe('renderTweetToImage with bgImage', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url) => {
      const imageData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const ab = new ArrayBuffer(imageData.length);
      new Uint8Array(ab).set(imageData);
      return {
        ok: true,
        arrayBuffer: async () => ab,
        headers: { get: () => 'image/png' },
      };
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches bgImage URL and passes buffer to sharp composite', async () => {
    const tweet = cloneTweet();
    await renderTweetToImage(tweet, { bgImage: 'https://example.com/bg.jpg' });

    // Verify bgImage URL was fetched
    const fetchCalls = globalThis.fetch.mock.calls.map(c => c[0]);
    expect(fetchCalls).toContain('https://example.com/bg.jpg');

    // Verify sharp was called for compositing (metadata + resize + composite)
    expect(sharpFn._instance.metadata).toHaveBeenCalled();
    expect(sharpFn._instance.composite).toHaveBeenCalledWith([
      { input: expect.any(Buffer), gravity: 'center' },
    ]);
  });

  it('forces needsWrapper=true when bgImage is provided (card gets shadow/radius)', async () => {
    const satori = (await import('satori')).default;
    satori.mockClear();

    const tweet = cloneTweet();
    // No gradient or fixed dimensions — but bgImage should still force wrapper
    await renderTweetToImage(tweet, { bgImage: 'https://example.com/bg.jpg' });

    // satori receives canvasWidth that includes gradient padding (40px each side)
    const satoriCall = satori.mock.calls[0];
    const satoriWidth = satoriCall[1].width;
    // Without bgImage: canvasWidth would be 550 (no padding added)
    // With bgImage: hasGradient is true → canvasWidth = 550 + 40*2 = 630
    expect(satoriWidth).toBe(630);
  });

  it('renders successfully even when bgImage fetch fails (graceful degradation)', async () => {
    const bgFetchFail = vi.fn(async (url) => {
      if (url === 'https://example.com/broken-bg.jpg') {
        return { ok: false, status: 500, headers: { get: () => null } };
      }
      // Normal image responses for tweet images
      const imageData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const ab = new ArrayBuffer(imageData.length);
      new Uint8Array(ab).set(imageData);
      return {
        ok: true,
        arrayBuffer: async () => ab,
        headers: { get: () => 'image/png' },
      };
    });
    globalThis.fetch = bgFetchFail;

    const tweet = cloneTweet();
    const result = await renderTweetToImage(tweet, { bgImage: 'https://example.com/broken-bg.jpg' });

    // Should still render successfully (no error thrown)
    expect(result.format).toBe('png');
    expect(Buffer.isBuffer(result.data)).toBe(true);

    // Should NOT have called composite (bgImageBuffer is null)
    expect(sharpFn._instance.composite).not.toHaveBeenCalled();
  });

  it('does not pass bgImage to generateTweetHtml (bgImage is for sharp, not CSS)', async () => {
    const { html } = await import('satori-html');
    html.mockClear();

    const tweet = cloneTweet();
    await renderTweetToImage(tweet, { bgImage: 'https://example.com/bg.jpg' });

    // The HTML string passed to satori-html should NOT contain the bgImage URL
    const htmlCall = html.mock.calls[0][0];
    expect(htmlCall).not.toContain('https://example.com/bg.jpg');
  });

  it('returns correct format and contentType with bgImage', async () => {
    const tweet = cloneTweet();
    const result = await renderTweetToImage(tweet, {
      bgImage: 'https://example.com/bg.jpg',
      format: 'png',
    });
    expect(result.format).toBe('png');
    expect(result.contentType).toBe('image/png');
  });

  it('does not composite for SVG format (bgImage is raster-only)', async () => {
    const tweet = cloneTweet();
    const result = await renderTweetToImage(tweet, {
      bgImage: 'https://example.com/bg.jpg',
      format: 'svg',
    });
    expect(result.format).toBe('svg');
    // composite should not have been called — SVG returns before raster step
    // (metadata may or may not be called depending on when bgImage is fetched,
    // but composite on the raster buffer should not happen)
    expect(sharpFn._instance.composite).not.toHaveBeenCalled();
  });

  it('does not fetch bgImage when bgImage option is null', async () => {
    const tweet = cloneTweet();
    await renderTweetToImage(tweet, { bgImage: null });

    // No composite calls
    expect(sharpFn._instance.composite).not.toHaveBeenCalled();
  });

  it('does not fetch bgImage when bgImage option is not provided', async () => {
    const tweet = cloneTweet();
    await renderTweetToImage(tweet);

    // No composite calls
    expect(sharpFn._instance.composite).not.toHaveBeenCalled();
  });
});

// ─── renderThreadToImage with bgImage ────────────────────────────────────────

describe('renderThreadToImage with bgImage', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      const imageData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const ab = new ArrayBuffer(imageData.length);
      new Uint8Array(ab).set(imageData);
      return {
        ok: true,
        arrayBuffer: async () => ab,
        headers: { get: () => 'image/png' },
      };
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches bgImage URL and composites onto thread render', async () => {
    const tweets = [cloneTweet(), cloneTweet({ text: 'Second tweet' })];
    await renderThreadToImage(tweets, { bgImage: 'https://example.com/bg.jpg' });

    const fetchCalls = globalThis.fetch.mock.calls.map(c => c[0]);
    expect(fetchCalls).toContain('https://example.com/bg.jpg');
    expect(sharpFn._instance.composite).toHaveBeenCalled();
  });

  it('renders thread successfully when bgImage fetch fails', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      if (url === 'https://example.com/broken-bg.jpg') {
        return { ok: false, status: 404, headers: { get: () => null } };
      }
      const imageData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const ab = new ArrayBuffer(imageData.length);
      new Uint8Array(ab).set(imageData);
      return {
        ok: true,
        arrayBuffer: async () => ab,
        headers: { get: () => 'image/png' },
      };
    });

    const tweets = [cloneTweet()];
    const result = await renderThreadToImage(tweets, {
      bgImage: 'https://example.com/broken-bg.jpg',
    });
    expect(result.format).toBe('png');
    expect(Buffer.isBuffer(result.data)).toBe(true);
    expect(sharpFn._instance.composite).not.toHaveBeenCalled();
  });

  it('does not composite for SVG format in thread render', async () => {
    const tweets = [cloneTweet()];
    const result = await renderThreadToImage(tweets, {
      bgImage: 'https://example.com/bg.jpg',
      format: 'svg',
    });
    expect(result.format).toBe('svg');
    expect(sharpFn._instance.composite).not.toHaveBeenCalled();
  });
});
