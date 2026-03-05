/**
 * Unit tests for core.mjs — rendering core shared by CLI and API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_TWEET } from '../helpers/test-fixtures.mjs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock logger used by core modules (tweet-render, tweet-fetch, tweet-fonts)
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

// Mock satori default export
vi.mock('satori', () => ({
  default: vi.fn(async () => '<svg>mock</svg>'),
}));

// Mock Resvg — must use function (not arrow) so `new` works
vi.mock('@resvg/resvg-js', () => {
  const MockResvg = vi.fn(function () {
    this.render = () => ({ asPng: () => Buffer.from('fake-png-data') });
  });
  return { Resvg: MockResvg };
});

// Mock sharp — chainable API returning a buffer
vi.mock('sharp', () => {
  const sharpInstance = {
    resize: vi.fn().mockReturnThis(),
    sharpen: vi.fn().mockReturnThis(),
    trim: vi.fn().mockReturnThis(),
    png: vi.fn().mockReturnThis(),
    jpeg: vi.fn().mockReturnThis(),
    webp: vi.fn().mockReturnThis(),
    toBuffer: vi.fn(async () => Buffer.from('ssaa-png-data')),
  };
  const sharpFn = vi.fn(() => sharpInstance);
  sharpFn._instance = sharpInstance;
  return { default: sharpFn };
});

// Mock satori-html
vi.mock('satori-html', () => ({
  html: vi.fn((input) => ({ type: 'div', props: { children: input } })),
}));

// Mock fs for loadFonts
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => {
        // Return a buffer that looks like a WOFF font (starts with 'wOFF')
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

// Mock tweet-emoji.mjs (CDN fetch not needed in unit tests)
vi.mock('../../tweet-emoji.mjs', () => ({
  fetchEmoji: vi.fn(async () => 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='),
  emojiToCodepoint: vi.fn((emoji) => '1f600'),
  clearEmojiCache: vi.fn(),
  getEmojiCacheSize: vi.fn(() => 0),
}));

// Mock tweet-fonts.mjs (no disk I/O in unit tests)
vi.mock('../../tweet-fonts.mjs', () => ({
  loadLanguageFont: vi.fn(() => undefined),
  getSupportedLanguages: vi.fn(() => ['ja-JP', 'ko-KR', 'zh-CN']),
  clearFontCache: vi.fn(),
}));

// Mock pdfkit
vi.mock('pdfkit', () => {
  const EventEmitter = require('events');
  return {
    default: vi.fn().mockImplementation(() => {
      const doc = new EventEmitter();
      doc.info = {};
      doc.pipe = vi.fn();
      doc.addPage = vi.fn().mockReturnThis();
      doc.image = vi.fn().mockReturnThis();
      doc.openImage = vi.fn(() => ({ width: 550, height: 400 }));
      doc.end = vi.fn(() => {
        // Simulate stream finish on next tick
        process.nextTick(() => doc.emit('finish'));
      });
      return doc;
    }),
  };
});

const satori = (await import('satori')).default;
const { Resvg } = await import('@resvg/resvg-js');
const sharpMod = await import('sharp');
const sharpFn = sharpMod.default;
const { html } = await import('satori-html');

const {
  extractTweetId,
  fetchTweet,
  fetchThread,
  translateText,
  fetchImageAsBase64,
  countMediaImages,
  formatDate,
  formatNumber,
  generateTweetHtml,
  renderTweetToImage,
  THEMES,
  DIMENSIONS,
  GRADIENTS,
  SSAA_MULTIPLIER,
  SSAA_MAX_INTERNAL_WIDTH,
  FORMAT_CONTENT_TYPES,
} = await import('../../core.mjs');

const { AppError } = await import('../../src/errors.mjs');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a deep clone of MOCK_TWEET to avoid cross-test mutation */
function cloneTweet(overrides = {}) {
  return structuredClone({ ...MOCK_TWEET, ...overrides });
}

/** Create a mock fetch Response */
function mockFetchResponse(body, { ok = true, status = 200, statusText = 'OK', contentType = 'application/json' } = {}) {
  return {
    ok,
    status,
    statusText,
    json: async () => body,
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

// ─── extractTweetId ──────────────────────────────────────────────────────────

describe('extractTweetId', () => {
  it('extracts raw numeric ID', () => {
    expect(extractTweetId('1234567890')).toBe('1234567890');
  });

  it('extracts from twitter.com URL', () => {
    expect(extractTweetId('https://twitter.com/elonmusk/status/1234567890'))
      .toBe('1234567890');
  });

  it('extracts from x.com URL', () => {
    expect(extractTweetId('https://x.com/elonmusk/status/9876543210'))
      .toBe('9876543210');
  });

  it('handles URL with query params', () => {
    expect(extractTweetId('https://twitter.com/user/status/111222333?s=20&t=abc'))
      .toBe('111222333');
  });

  it('handles URL with trailing path segments', () => {
    expect(extractTweetId('https://x.com/user/status/111222333/photo/1'))
      .toBe('111222333');
  });

  it('throws for non-URL non-numeric string', () => {
    expect(() => extractTweetId('not-a-tweet')).toThrow('Invalid tweet URL or ID. Please provide a numeric tweet ID or a full twitter.com/x.com URL.');
  });

  it('throws for URL without status ID', () => {
    expect(() => extractTweetId('https://twitter.com/user')).toThrow('Invalid tweet URL or ID. Please provide a numeric tweet ID or a full twitter.com/x.com URL.');
  });

  it('handles very long numeric IDs (19+ digits)', () => {
    const longId = '1234567890123456789';
    expect(extractTweetId(longId)).toBe(longId);
  });
});

// ─── formatDate ──────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats ISO date to readable string', () => {
    const result = formatDate('2024-01-15T12:00:00.000Z');
    // Should contain time and date parts separated by ·
    expect(result).toContain('·');
    expect(result).toContain('2024');
    expect(result).toContain('Jan');
  });

  it('formats AM times correctly', () => {
    const result = formatDate('2024-06-15T03:30:00.000Z');
    // The exact output depends on locale/timezone but should contain AM
    expect(result).toMatch(/AM|PM/);
  });

  it('formats PM times correctly', () => {
    const result = formatDate('2024-06-15T15:30:00.000Z');
    expect(result).toMatch(/AM|PM/);
  });

  it('pads single-digit minutes', () => {
    const result = formatDate('2024-01-15T10:05:00.000Z');
    // Should contain :05 not :5
    expect(result).toMatch(/:\d{2}/);
  });

  it('returns a non-empty string for any valid date', () => {
    const result = formatDate('2020-12-25T00:00:00.000Z');
    expect(result.length).toBeGreaterThan(5);
    expect(result).toContain('·');
  });
});

// ─── formatNumber ────────────────────────────────────────────────────────────

describe('formatNumber', () => {
  it('returns plain number for < 1000', () => {
    expect(formatNumber(42)).toBe('42');
  });

  it('returns K format for 1000+', () => {
    expect(formatNumber(1500)).toBe('1.5K');
  });

  it('drops trailing .0 for even thousands', () => {
    expect(formatNumber(1000)).toBe('1K');
  });

  it('returns M format for 1M+', () => {
    expect(formatNumber(1500000)).toBe('1.5M');
  });

  it('drops trailing .0 for even millions', () => {
    expect(formatNumber(2000000)).toBe('2M');
  });

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('returns plain number for 999', () => {
    expect(formatNumber(999)).toBe('999');
  });
});

// ─── fetchImageAsBase64 ──────────────────────────────────────────────────────

describe('fetchImageAsBase64', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns data URI with correct content-type', async () => {
    const imageData = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header bytes
    globalThis.fetch = vi.fn(async () => mockFetchResponse(imageData, { contentType: 'image/png' }));

    const result = await fetchImageAsBase64('https://example.com/image.png');
    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it('defaults to image/jpeg when no content-type', async () => {
    const imageData = Buffer.from([0xff, 0xd8]);
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => imageData.buffer.slice(imageData.byteOffset, imageData.byteOffset + imageData.byteLength),
      headers: { get: () => null },
    }));

    const result = await fetchImageAsBase64('https://example.com/img');
    expect(result).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('returns null on fetch failure', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('network error'); });

    const result = await fetchImageAsBase64('https://example.com/broken');
    expect(result).toBeNull();
  });

  it('encodes binary data as base64', async () => {
    const rawBytes = Buffer.from([1, 2, 3, 4, 5]);
    globalThis.fetch = vi.fn(async () => mockFetchResponse(rawBytes, { contentType: 'image/png' }));

    const result = await fetchImageAsBase64('https://example.com/img.png');
    const base64Part = result.split(',')[1];
    const decoded = Buffer.from(base64Part, 'base64');
    expect(decoded).toEqual(rawBytes);
  });

  it('handles empty response body', async () => {
    const emptyBuf = Buffer.alloc(0);
    globalThis.fetch = vi.fn(async () => mockFetchResponse(emptyBuf, { contentType: 'image/png' }));

    const result = await fetchImageAsBase64('https://example.com/empty');
    expect(result).toMatch(/^data:image\/png;base64,$/);
  });

  it('returns null when image fetch times out (AbortError)', async () => {
    // Simulate a fetch that never resolves — gets aborted by the internal timeout
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
    const resultPromise = fetchImageAsBase64('https://example.com/huge-image.jpg');

    // Advance past the 10s per-image timeout
    vi.advanceTimersByTime(10_000);

    const result = await resultPromise;
    expect(result).toBeNull();

    vi.useRealTimers();
  });

  it('returns null on HTTP error status', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, headers: { get: () => null } }));

    const result = await fetchImageAsBase64('https://example.com/missing.jpg');
    expect(result).toBeNull();
  });
});

// ─── countMediaImages ────────────────────────────────────────────────────────

describe('countMediaImages', () => {
  it('returns 0 for tweet with no media', () => {
    expect(countMediaImages({ text: 'Hello' })).toBe(0);
  });

  it('returns 0 for null/undefined input', () => {
    expect(countMediaImages(null)).toBe(0);
    expect(countMediaImages(undefined)).toBe(0);
  });

  it('counts mediaDetails images', () => {
    const tweet = {
      mediaDetails: [
        { media_url_https: 'https://pbs.twimg.com/media/a.jpg' },
        { media_url_https: 'https://pbs.twimg.com/media/b.jpg' },
      ],
    };
    expect(countMediaImages(tweet)).toBe(2);
  });

  it('counts photos when mediaDetails is absent', () => {
    const tweet = {
      photos: [
        { url: 'https://pbs.twimg.com/media/a.jpg' },
        { url: 'https://pbs.twimg.com/media/b.jpg' },
        { url: 'https://pbs.twimg.com/media/c.jpg' },
      ],
    };
    expect(countMediaImages(tweet)).toBe(3);
  });

  it('prefers mediaDetails over photos (no double counting)', () => {
    const tweet = {
      mediaDetails: [{ media_url_https: 'a.jpg' }],
      photos: [{ url: 'a.jpg' }, { url: 'b.jpg' }],
    };
    // Should use mediaDetails (1), not photos (2)
    expect(countMediaImages(tweet)).toBe(1);
  });

  it('includes quoted tweet media', () => {
    const tweet = {
      mediaDetails: [{ media_url_https: 'a.jpg' }],
      quoted_tweet: {
        mediaDetails: [{ media_url_https: 'qt-a.jpg' }, { media_url_https: 'qt-b.jpg' }],
      },
    };
    expect(countMediaImages(tweet)).toBe(3);
  });

  it('counts quoted tweet photos when mediaDetails absent', () => {
    const tweet = {
      quoted_tweet: {
        photos: [{ url: 'qt.jpg' }],
      },
    };
    expect(countMediaImages(tweet)).toBe(1);
  });

  it('handles max case: 4 main + 4 quoted', () => {
    const tweet = {
      mediaDetails: Array(4).fill({ media_url_https: 'img.jpg' }),
      quoted_tweet: {
        mediaDetails: Array(4).fill({ media_url_https: 'qt.jpg' }),
      },
    };
    expect(countMediaImages(tweet)).toBe(8);
  });
});

// ─── fetchTweet ──────────────────────────────────────────────────────────────

describe('fetchTweet', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns tweet data on success', async () => {
    const tweetData = { text: 'Hello world', user: { name: 'Test' } };
    globalThis.fetch = vi.fn(async () => mockFetchResponse(tweetData));

    const result = await fetchTweet('123456');
    expect(result).toEqual(tweetData);
  });

  it('throws 404 on HTTP 404 response', async () => {
    globalThis.fetch = vi.fn(async () => mockFetchResponse({}, { ok: false, status: 404, statusText: 'Not Found' }));

    const err = await fetchTweet('999').catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Tweet not found or is no longer available');
  });

  it('throws 404 on HTTP 400 response (invalid/oversized tweet ID)', async () => {
    globalThis.fetch = vi.fn(async () => mockFetchResponse({}, { ok: false, status: 400, statusText: 'Bad Request' }));

    const err = await fetchTweet('99999999999999999999').catch(e => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Tweet not found or is no longer available');
  });

  it('throws when data.text is falsy', async () => {
    globalThis.fetch = vi.fn(async () => mockFetchResponse({ text: null }));

    await expect(fetchTweet('123')).rejects.toThrow('Tweet not found or unavailable');
  });

  it('calls syndication API URL with tweet ID', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      expect(url).toContain('cdn.syndication.twimg.com/tweet-result');
      expect(url).toContain('id=789');
      return mockFetchResponse({ text: 'test', user: {} });
    });

    await fetchTweet('789');
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('includes token parameter in URL', async () => {
    globalThis.fetch = vi.fn(async (url) => {
      expect(url).toMatch(/token=\d+/);
      return mockFetchResponse({ text: 'test', user: {} });
    });

    await fetchTweet('123');
  });

  it('parses JSON response', async () => {
    const data = { text: 'parsed', user: { name: 'X' }, favorite_count: 100 };
    globalThis.fetch = vi.fn(async () => mockFetchResponse(data));

    const result = await fetchTweet('456');
    expect(result.favorite_count).toBe(100);
  });
});

// ─── fetchThread ─────────────────────────────────────────────────────────────

describe('fetchThread', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns single-tweet array when no parent', async () => {
    const tweet = { text: 'standalone', user: { screen_name: 'user1' } };
    globalThis.fetch = vi.fn(async () => mockFetchResponse(tweet));

    const result = await fetchThread('100');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('standalone');
  });

  it('walks parent chain for same author', async () => {
    const parent = { text: 'parent tweet', user: { screen_name: 'user1' } };
    const child = { text: 'child tweet', user: { screen_name: 'user1' }, parent: { id_str: '99' } };

    let callCount = 0;
    globalThis.fetch = vi.fn(async (url) => {
      callCount++;
      if (callCount === 1) return mockFetchResponse(child); // initial tweet
      return mockFetchResponse(parent); // parent fetch
    });

    const result = await fetchThread('100');
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('parent tweet');
    expect(result[1].text).toBe('child tweet');
  });

  it('stops walking when different author encountered', async () => {
    const otherAuthor = { text: 'reply from someone else', user: { screen_name: 'other_user' } };
    const child = { text: 'my reply', user: { screen_name: 'user1' }, parent: { id_str: '50' } };

    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) return mockFetchResponse(child);
      return mockFetchResponse(otherAuthor);
    });

    const result = await fetchThread('100');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('my reply');
  });

  it('stops walking silently on 404 (parent deleted)', async () => {
    const child = { text: 'child', user: { screen_name: 'user1' }, parent: { id_str: '50' } };

    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) return mockFetchResponse(child);
      return mockFetchResponse({}, { ok: false, status: 404, statusText: 'Not Found' });
    });

    mockLogger.warn.mockClear();
    const result = await fetchThread('100');
    expect(result).toHaveLength(1);
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('logs warning and stops walking on non-404 error (e.g., 429 rate limit)', async () => {
    const child = { text: 'child', user: { screen_name: 'user1' }, parent: { id_str: '50' } };

    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) return mockFetchResponse(child);
      return mockFetchResponse({}, { ok: false, status: 429, statusText: 'Too Many Requests' });
    });

    mockLogger.warn.mockClear();
    const result = await fetchThread('100');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('child');
    expect(mockLogger.warn).toHaveBeenCalledOnce();
    expect(mockLogger.warn.mock.calls[0][1]).toBe('Thread walk halted');
  });

  it('returns tweets in chronological order (parents first)', async () => {
    const grandparent = { text: 'first', user: { screen_name: 'user1' } };
    const parent = { text: 'second', user: { screen_name: 'user1' }, parent: { id_str: '1' } };
    const child = { text: 'third', user: { screen_name: 'user1' }, parent: { id_str: '2' } };

    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) return mockFetchResponse(child);
      if (callCount === 2) return mockFetchResponse(parent);
      return mockFetchResponse(grandparent);
    });

    const result = await fetchThread('3');
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe('first');
    expect(result[1].text).toBe('second');
    expect(result[2].text).toBe('third');
  });

  it('handles deeply nested parent chain', async () => {
    // 3 levels: great-grandparent → grandparent → parent → child
    const ggp = { text: 'ggp', user: { screen_name: 'a' } };
    const gp = { text: 'gp', user: { screen_name: 'a' }, parent: { id_str: '1' } };
    const p = { text: 'p', user: { screen_name: 'a' }, parent: { id_str: '2' } };
    const c = { text: 'c', user: { screen_name: 'a' }, parent: { id_str: '3' } };

    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) return mockFetchResponse(c);
      if (callCount === 2) return mockFetchResponse(p);
      if (callCount === 3) return mockFetchResponse(gp);
      return mockFetchResponse(ggp);
    });

    const result = await fetchThread('4');
    expect(result).toHaveLength(4);
    expect(result.map(t => t.text)).toEqual(['ggp', 'gp', 'p', 'c']);
  });
});

// ─── translateText ───────────────────────────────────────────────────────────

describe('translateText', () => {
  let originalFetch;
  let originalEnv;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.OPENAI_API_KEY = originalEnv;
  });

  it('returns original text when OPENAI_API_KEY not set', async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await translateText('Hello world', 'es');
    expect(result).toBe('Hello world');
  });

  it('calls OpenAI API with correct model', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    globalThis.fetch = vi.fn(async (url, opts) => {
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      const body = JSON.parse(opts.body);
      expect(body.model).toBe('gpt-4o-mini');
      expect(body.messages).toHaveLength(2);
      expect(opts.headers.Authorization).toBe('Bearer test-key');
      return mockFetchResponse({
        choices: [{ message: { content: 'Hola mundo' } }],
      });
    });

    const result = await translateText('Hello world', 'es');
    expect(result).toBe('Hola mundo');
  });

  it('returns translated text from response', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    globalThis.fetch = vi.fn(async () => mockFetchResponse({
      choices: [{ message: { content: 'Bonjour le monde' } }],
    }));

    const result = await translateText('Hello world', 'fr');
    expect(result).toBe('Bonjour le monde');
  });

  it('returns original text on API error', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    globalThis.fetch = vi.fn(async () => mockFetchResponse({}, { ok: false, status: 500 }));

    const result = await translateText('Hello', 'de');
    expect(result).toBe('Hello');
  });

  it('returns original text on network failure', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    globalThis.fetch = vi.fn(async () => { throw new Error('network down'); });

    const result = await translateText('Hello', 'ja');
    expect(result).toBe('Hello');
  });

  it('returns original text when response has no choices', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    globalThis.fetch = vi.fn(async () => mockFetchResponse({ choices: [{ message: {} }] }));

    const result = await translateText('Hello', 'ko');
    expect(result).toBe('Hello');
  });
});

// ─── generateTweetHtml ───────────────────────────────────────────────────────

describe('generateTweetHtml', () => {
  it('returns HTML string with tweet text', () => {
    const tweet = cloneTweet();
    const result = generateTweetHtml(tweet, 'dark');
    expect(result).toContain('Hello, this is a test tweet!');
  });

  it('applies dark theme colors', () => {
    const tweet = cloneTweet();
    const result = generateTweetHtml(tweet, 'dark');
    expect(result).toContain(THEMES.dark.bg);
    expect(result).toContain(THEMES.dark.text);
  });

  it('applies light theme colors', () => {
    const tweet = cloneTweet();
    const result = generateTweetHtml(tweet, 'light');
    expect(result).toContain(THEMES.light.bg);
  });

  it('escapes HTML entities in tweet text', () => {
    const tweet = cloneTweet({ text: 'Use <div> & "quotes"' });
    const result = generateTweetHtml(tweet, 'dark');
    expect(result).toContain('&lt;div&gt;');
    expect(result).toContain('&amp;');
    expect(result).not.toContain('<div>');
  });

  it('converts newlines to <br/>', () => {
    const tweet = cloneTweet({ text: 'line1\nline2\nline3' });
    const result = generateTweetHtml(tweet, 'dark');
    expect(result).toContain('line1<br/>line2<br/>line3');
  });

  it('strips media URLs from text', () => {
    const tweet = cloneTweet({
      text: 'Check this out https://t.co/media123',
      entities: { media: [{ url: 'https://t.co/media123' }], urls: [], user_mentions: [], hashtags: [] },
    });
    const result = generateTweetHtml(tweet, 'dark');
    expect(result).not.toContain('https://t.co/media123');
    expect(result).toContain('Check this out');
  });

  it('colors URLs with link color', () => {
    const tweet = cloneTweet({
      text: 'Visit https://t.co/abc for info',
      entities: {
        urls: [{ url: 'https://t.co/abc', display_url: 'example.com' }],
        user_mentions: [],
        hashtags: [],
      },
    });
    const result = generateTweetHtml(tweet, 'dark');
    expect(result).toContain(`color: ${THEMES.dark.link}`);
    expect(result).toContain('example.com');
  });

  it('colors mentions with link color', () => {
    const tweet = cloneTweet({
      text: 'Hey @someuser check this',
      entities: {
        urls: [],
        user_mentions: [{ screen_name: 'someuser' }],
        hashtags: [],
      },
    });
    const result = generateTweetHtml(tweet, 'dark');
    expect(result).toContain(`color: ${THEMES.dark.link}`);
    expect(result).toContain('@someuser');
  });

  it('colors hashtags with link color', () => {
    const tweet = cloneTweet();
    const result = generateTweetHtml(tweet, 'dark');
    // MOCK_TWEET has hashtag 'testing'
    expect(result).toContain('#testing');
    expect(result).toContain(`color: ${THEMES.dark.link}`);
  });

  it('trims reply-to mentions via display_text_range', () => {
    // Simulates: "@glazeapps See @glazeapps in action" with display_text_range [11, 35]
    // "@glazeapps " is 11 chars (0-10), visible text starts at index 11 ("See ...")
    const tweet = cloneTweet({
      text: '@glazeapps See @glazeapps in action',
      display_text_range: [11, 35],
      entities: {
        urls: [],
        user_mentions: [
          { screen_name: 'glazeapps', indices: [0, 10] },
          { screen_name: 'glazeapps', indices: [15, 25] },
        ],
        hashtags: [],
      },
    });
    const result = generateTweetHtml(tweet, 'dark');
    // Only "See @glazeapps in action" should remain
    expect(result).toContain('See');
    expect(result).toContain('in action');
    // Count @glazeapps occurrences — should appear exactly once (the inline one)
    const matches = result.match(/@glazeapps/gi);
    expect(matches).toHaveLength(1);
  });

  it('preserves full text when display_text_range starts at 0', () => {
    const tweet = cloneTweet({
      text: 'Hello world, @someone!',
      display_text_range: [0, 22],
      entities: {
        urls: [],
        user_mentions: [{ screen_name: 'someone', indices: [13, 21] }],
        hashtags: [],
      },
    });
    const result = generateTweetHtml(tweet, 'dark');
    expect(result).toContain('Hello world');
    expect(result).toContain('@someone');
  });

  it('handles missing display_text_range gracefully', () => {
    const tweet = cloneTweet({
      text: '@user Hello from a reply',
      entities: {
        urls: [],
        user_mentions: [{ screen_name: 'user', indices: [0, 5] }],
        hashtags: [],
      },
    });
    // No display_text_range — text should be unchanged (backward compat)
    const result = generateTweetHtml(tweet, 'dark');
    expect(result).toContain('@user');
    expect(result).toContain('Hello from a reply');
  });

  it('does not double-wrap duplicate mention entities', () => {
    const tweet = cloneTweet({
      text: 'See @glazeapps in action',
      display_text_range: [0, 24],
      entities: {
        urls: [],
        user_mentions: [
          { screen_name: 'glazeapps', indices: [4, 14] },
          { screen_name: 'glazeapps', indices: [4, 14] },
        ],
        hashtags: [],
      },
    });
    const result = generateTweetHtml(tweet, 'dark');
    // Should have exactly one colored span wrapping @glazeapps, not nested spans
    const spanPattern = /<span[^>]*>@glazeapps<\/span>/gi;
    const spanMatches = result.match(spanPattern);
    expect(spanMatches).toHaveLength(1);
  });

  it('includes verified badge when is_blue_verified', () => {
    const tweet = cloneTweet();
    tweet.user.is_blue_verified = true;
    const result = generateTweetHtml(tweet, 'dark');
    expect(result).toContain('viewBox="0 0 22 22"');
  });

  it('hides verified badge when hideVerified is true', () => {
    const tweet = cloneTweet();
    tweet.user.is_blue_verified = true;
    const result = generateTweetHtml(tweet, 'dark', { hideVerified: true });
    // The header's verified badge should not appear (the SVG viewBox for badge)
    const headerSection = result.split('<!-- Tweet text -->')[0];
    // Count verified badge SVGs in the header — should be 0
    expect(headerSection).not.toContain('viewBox="0 0 22 22"');
  });

  it('shows metrics section by default', () => {
    const tweet = cloneTweet({ favorite_count: 42, conversation_count: 7 });
    const result = generateTweetHtml(tweet, 'dark');
    expect(result).toContain('42');
    expect(result).toContain('7');
  });

  it('hides metrics when showMetrics is false', () => {
    const tweet = cloneTweet({ favorite_count: 42 });
    const result = generateTweetHtml(tweet, 'dark', { showMetrics: false });
    // Metrics section should not appear
    expect(result).not.toContain('gap: 24px');
  });

  it('hides date when hideDate is true', () => {
    const tweet = cloneTweet();
    const withDate = generateTweetHtml(tweet, 'dark', { hideDate: false });
    const withoutDate = generateTweetHtml(cloneTweet(), 'dark', { hideDate: true });
    expect(withDate).toContain('·');
    expect(withoutDate.length).toBeLessThan(withDate.length);
  });

  it('applies custom backgroundColor', () => {
    const tweet = cloneTweet();
    const result = generateTweetHtml(tweet, 'dark', { backgroundColor: '#ff0000' });
    expect(result).toContain('#ff0000');
  });

  it('applies gradient background when provided', () => {
    const tweet = cloneTweet();
    const result = generateTweetHtml(tweet, 'dark', { backgroundGradient: 'sunset' });
    expect(result).toContain(GRADIENTS.sunset);
  });

  it('includes media image when present', () => {
    const tweet = cloneTweet({
      mediaDetails: [{ media_url_https: 'https://pbs.twimg.com/media/test.jpg' }],
    });
    const result = generateTweetHtml(tweet, 'dark');
    expect(result).toContain('https://pbs.twimg.com/media/test.jpg');
  });

  it('hides media when hideMedia is true', () => {
    const tweet = cloneTweet({
      mediaDetails: [{ media_url_https: 'https://pbs.twimg.com/media/test.jpg' }],
    });
    const result = generateTweetHtml(tweet, 'dark', { hideMedia: true });
    // The media URL should still be in text processing but the media section should not render
    expect(result).not.toContain('object-fit: cover');
  });

  it('includes quote tweet when present', () => {
    const tweet = cloneTweet({
      quoted_tweet: {
        text: 'This is a quoted tweet',
        user: { name: 'Quoter', screen_name: 'quoter', profile_image_url_https: 'https://img.com/qt.jpg' },
      },
    });
    const result = generateTweetHtml(tweet, 'dark');
    expect(result).toContain('This is a quoted tweet');
    expect(result).toContain('Quoter');
  });

  it('truncates long quote tweet text at 200 chars', () => {
    const longText = 'A'.repeat(250);
    const tweet = cloneTweet({
      quoted_tweet: {
        text: longText,
        user: { name: 'Qt', screen_name: 'qt' },
      },
    });
    const result = generateTweetHtml(tweet, 'dark');
    expect(result).toContain('A'.repeat(197) + '...');
    expect(result).not.toContain('A'.repeat(200));
  });

  it('applies custom textColor and linkColor', () => {
    const tweet = cloneTweet();
    const result = generateTweetHtml(tweet, 'dark', {
      textColor: '#aabbcc',
      linkColor: '#112233',
    });
    expect(result).toContain('#aabbcc');
  });

  it('shows tweet URL when showUrl is true and tweetId is provided', () => {
    const tweet = cloneTweet();
    const result = generateTweetHtml(tweet, 'dark', {
      showUrl: true,
      tweetId: '1234567890',
    });
    expect(result).toContain('https://x.com/testuser/status/1234567890');
  });

  it('omits tweet URL when showUrl is false (default)', () => {
    const tweet = cloneTweet();
    const result = generateTweetHtml(tweet, 'dark');
    expect(result).not.toContain('https://x.com/');
  });

  it('omits tweet URL when showUrl is true but tweetId is missing', () => {
    const tweet = cloneTweet();
    const result = generateTweetHtml(tweet, 'dark', { showUrl: true });
    expect(result).not.toContain('https://x.com/');
  });

  it('uses the tweet user handle in the URL', () => {
    const tweet = cloneTweet();
    tweet.user.screen_name = 'testuser123';
    const result = generateTweetHtml(tweet, 'dark', {
      showUrl: true,
      tweetId: '9876543210',
    });
    expect(result).toContain('https://x.com/testuser123/status/9876543210');
  });
});

// ─── loadFonts ───────────────────────────────────────────────────────────────

describe('loadFonts', () => {
  // loadFonts uses module-level _cachedFonts, so we need to test it
  // through the already-imported module. The first call in the test suite
  // (from renderTweetToImage tests or direct call) will cache.
  // We test the behavior we can observe.

  it('returns an array of font objects', async () => {
    // Since fs is mocked to return valid font data, loadFonts should work
    // Note: _cachedFonts may already be set from prior imports; this test
    // validates the return shape.
    const { loadFonts: lf } = await import('../../core.mjs');
    const fonts = await lf();
    expect(Array.isArray(fonts)).toBe(true);
    expect(fonts.length).toBeGreaterThan(0);
  });

  it('returns fonts with name, data, weight, and style', async () => {
    const { loadFonts: lf } = await import('../../core.mjs');
    const fonts = await lf();
    for (const font of fonts) {
      expect(font).toHaveProperty('name');
      expect(font).toHaveProperty('data');
      expect(font).toHaveProperty('weight');
      expect(font).toHaveProperty('style');
    }
  });

  it('font data is an ArrayBuffer', async () => {
    const { loadFonts: lf } = await import('../../core.mjs');
    const fonts = await lf();
    for (const font of fonts) {
      expect(font.data).toBeInstanceOf(ArrayBuffer);
    }
  });

  it('returns cached result on subsequent calls', async () => {
    const { loadFonts: lf } = await import('../../core.mjs');
    const first = await lf();
    const second = await lf();
    expect(first).toBe(second); // Same reference = cached
  });
});

// ─── renderTweetToImage ──────────────────────────────────────────────────────

describe('renderTweetToImage', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // Mock fetch for image pre-fetching (fetchImageAsBase64 calls)
    globalThis.fetch = vi.fn(async (url) => {
      // Return a fake image for any URL
      const imageData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      return {
        ok: true,
        arrayBuffer: async () => {
          const ab = new ArrayBuffer(imageData.length);
          new Uint8Array(ab).set(imageData);
          return ab;
        },
        headers: { get: () => 'image/png' },
      };
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns PNG by default', async () => {
    const tweet = cloneTweet();
    const result = await renderTweetToImage(tweet);
    expect(result.format).toBe('png');
    expect(result.contentType).toBe('image/png');
    expect(Buffer.isBuffer(result.data)).toBe(true);
  });

  it('returns SVG when format is svg', async () => {
    const tweet = cloneTweet();
    const result = await renderTweetToImage(tweet, { format: 'svg' });
    expect(result.format).toBe('svg');
    expect(result.contentType).toBe('image/svg+xml');
    expect(Buffer.isBuffer(result.data)).toBe(true);
  });

  it('pre-fetches profile image without mutating tweet', async () => {
    const tweet = cloneTweet();
    const originalProfileUrl = tweet.user.profile_image_url_https;
    await renderTweetToImage(tweet);
    // Tweet object is NOT mutated — base64 is injected into VDOM, not tweet
    expect(tweet.user.profile_image_url_https).toBe(originalProfileUrl);
    // But the profile image was still fetched
    const fetchCalls = globalThis.fetch.mock.calls.map(c => c[0]);
    expect(fetchCalls.some(u => u.includes('profile_images'))).toBe(true);
  });

  it('pre-fetches media images without mutating tweet', async () => {
    const tweet = cloneTweet({
      mediaDetails: [{ media_url_https: 'https://pbs.twimg.com/media/test.jpg' }],
    });
    const originalUrl = tweet.mediaDetails[0].media_url_https;
    await renderTweetToImage(tweet);
    // Tweet object is NOT mutated
    expect(tweet.mediaDetails[0].media_url_https).toBe(originalUrl);
    // But the media image was still fetched
    const fetchCalls = globalThis.fetch.mock.calls.map(c => c[0]);
    expect(fetchCalls.some(u => u.includes('pbs.twimg.com/media/test.jpg'))).toBe(true);
  });

  it('requests small Twitter CDN size for narrow widths', async () => {
    const tweet = cloneTweet({
      mediaDetails: [{ media_url_https: 'https://pbs.twimg.com/media/test.jpg' }],
      photos: [{ url: 'https://pbs.twimg.com/media/test.jpg' }],
    });
    await renderTweetToImage(tweet, { width: 550, scale: 1 });
    // Verify fetch was called with ?name=small for Twitter media URLs
    const fetchCalls = globalThis.fetch.mock.calls.map(c => c[0]);
    const mediaCalls = fetchCalls.filter(u => u.includes('pbs.twimg.com/media/'));
    expect(mediaCalls.length).toBeGreaterThan(0);
    mediaCalls.forEach(url => expect(url).toContain('?name=small'));
  });

  it('requests medium Twitter CDN size for wider widths', async () => {
    const tweet = cloneTweet({
      mediaDetails: [{ media_url_https: 'https://pbs.twimg.com/media/test.jpg' }],
    });
    await renderTweetToImage(tweet, { width: 1080, scale: 1 });
    const fetchCalls = globalThis.fetch.mock.calls.map(c => c[0]);
    const mediaCalls = fetchCalls.filter(u => u.includes('pbs.twimg.com/media/'));
    expect(mediaCalls.length).toBeGreaterThan(0);
    mediaCalls.forEach(url => expect(url).toContain('?name=medium'));
  });

  it('fetches all images in parallel (profile + media + photos)', async () => {
    const tweet = cloneTweet({
      mediaDetails: [
        { media_url_https: 'https://pbs.twimg.com/media/img1.jpg' },
        { media_url_https: 'https://pbs.twimg.com/media/img2.jpg' },
      ],
      photos: [
        { url: 'https://pbs.twimg.com/media/img1.jpg' },
        { url: 'https://pbs.twimg.com/media/img2.jpg' },
      ],
    });
    await renderTweetToImage(tweet);
    // Profile image + 2 mediaDetails + 2 photos = 5 fetch calls for images
    const fetchCalls = globalThis.fetch.mock.calls.map(c => c[0]);
    const imageCalls = fetchCalls.filter(u => u.includes('twimg.com'));
    expect(imageCalls.length).toBe(5);
    // Tweet object is NOT mutated (base64 injected into VDOM, not tweet)
    expect(tweet.user.profile_image_url_https).not.toMatch(/^data:/);
    expect(tweet.mediaDetails[0].media_url_https).not.toMatch(/^data:/);
    expect(tweet.mediaDetails[1].media_url_https).not.toMatch(/^data:/);
    expect(tweet.photos[0].url).not.toMatch(/^data:/);
    expect(tweet.photos[1].url).not.toMatch(/^data:/);
  });

  it('pre-fetches quote tweet images without mutating tweet', async () => {
    const tweet = cloneTweet({
      quoted_tweet: {
        text: 'quoted',
        user: {
          name: 'Qt',
          screen_name: 'qt',
          profile_image_url_https: 'https://pbs.twimg.com/qt.jpg',
        },
      },
    });
    const originalUrl = tweet.quoted_tweet.user.profile_image_url_https;
    await renderTweetToImage(tweet);
    // Tweet object is NOT mutated
    expect(tweet.quoted_tweet.user.profile_image_url_https).toBe(originalUrl);
    // But the quote tweet profile image was still fetched
    const fetchCalls = globalThis.fetch.mock.calls.map(c => c[0]);
    expect(fetchCalls.some(u => u.includes('pbs.twimg.com/qt.jpg'))).toBe(true);
  });

  it('calls satori with appropriate dimensions', async () => {
    const tweet = cloneTweet();
    await renderTweetToImage(tweet, { width: 600, padding: 20 });
    // Satori uses border-box: canvasWidth = width (padding is inside)
    expect(satori).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        width: 600,
      })
    );
  });

  it('applies scale factor with SSAA multiplier to Resvg width', async () => {
    const tweet = cloneTweet();
    await renderTweetToImage(tweet, { scale: 2, width: 550, padding: 20 });
    // Satori border-box: canvasWidth = 550, rasterWidth = 550 * 2 = 1100
    const targetWidth = 550 * 2; // 1100
    expect(Resvg).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fitTo: { mode: 'width', value: targetWidth * SSAA_MULTIPLIER },
      })
    );
  });

  describe('SSAA pipeline', () => {
    beforeEach(() => {
      sharpFn.mockClear();
      sharpFn._instance.resize.mockClear();
      sharpFn._instance.sharpen.mockClear();
      sharpFn._instance.trim.mockClear();
      sharpFn._instance.png.mockClear();
      sharpFn._instance.toBuffer.mockClear();
    });

    it('downscales from 3x to target width with Lanczos3', async () => {
      const tweet = cloneTweet();
      await renderTweetToImage(tweet, { scale: 2, width: 550, padding: 20 });
      // Satori uses border-box: canvasWidth = width (not width + padding*2)
      const targetWidth = 550 * 2; // 1100
      expect(sharpFn).toHaveBeenCalled();
      expect(sharpFn._instance.resize).toHaveBeenCalledWith(
        targetWidth, null, { kernel: 'lanczos3' }
      );
    });

    it('applies subtle sharpening after downscale', async () => {
      const tweet = cloneTweet();
      await renderTweetToImage(tweet, { scale: 1 });
      expect(sharpFn._instance.sharpen).toHaveBeenCalledWith({ sigma: 0.5 });
    });

    it('outputs PNG format through sharp', async () => {
      const tweet = cloneTweet();
      await renderTweetToImage(tweet, { scale: 1 });
      expect(sharpFn._instance.png).toHaveBeenCalled();
      expect(sharpFn._instance.toBuffer).toHaveBeenCalled();
    });

    it('skips SSAA when internal width exceeds cap', async () => {
      const tweet = cloneTweet();
      // outputWidth=5000 → internal would be 15000 > SSAA_MAX_INTERNAL_WIDTH (8000)
      await renderTweetToImage(tweet, { outputWidth: 5000 });
      expect(Resvg).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          fitTo: { mode: 'width', value: 5000 },
        })
      );
      // SSAA resize/sharpen skipped, but trim still runs for standalone renders
      expect(sharpFn._instance.resize).not.toHaveBeenCalled();
      expect(sharpFn._instance.sharpen).not.toHaveBeenCalled();
    });

    it('does not invoke sharp for SVG format', async () => {
      const tweet = cloneTweet();
      const result = await renderTweetToImage(tweet, { format: 'svg' });
      expect(result.format).toBe('svg');
      expect(sharpFn).not.toHaveBeenCalled();
    });

    it('returns a Buffer from the SSAA pipeline', async () => {
      const tweet = cloneTweet();
      const result = await renderTweetToImage(tweet);
      expect(result.format).toBe('png');
      expect(Buffer.isBuffer(result.data)).toBe(true);
    });

    it('exports SSAA constants', () => {
      expect(SSAA_MULTIPLIER).toBe(3);
      expect(SSAA_MAX_INTERNAL_WIDTH).toBe(8000);
    });
  });

  // ─── JPEG/WebP format support ─────────────────────────────────────────────

  describe('JPEG/WebP format output', () => {
    beforeEach(() => {
      sharpFn.mockClear();
      sharpFn._instance.resize.mockClear();
      sharpFn._instance.sharpen.mockClear();
      sharpFn._instance.trim.mockClear();
      sharpFn._instance.png.mockClear();
      sharpFn._instance.jpeg.mockClear();
      sharpFn._instance.webp.mockClear();
      sharpFn._instance.toBuffer.mockClear();
    });

    it('returns format=jpeg and contentType=image/jpeg for JPEG output', async () => {
      const tweet = cloneTweet();
      const result = await renderTweetToImage(tweet, { format: 'jpeg' });
      expect(result.format).toBe('jpeg');
      expect(result.contentType).toBe('image/jpeg');
      expect(Buffer.isBuffer(result.data)).toBe(true);
    });

    it('returns format=webp and contentType=image/webp for WebP output', async () => {
      const tweet = cloneTweet();
      const result = await renderTweetToImage(tweet, { format: 'webp' });
      expect(result.format).toBe('webp');
      expect(result.contentType).toBe('image/webp');
      expect(Buffer.isBuffer(result.data)).toBe(true);
    });

    it('calls sharp.jpeg() with quality 90 for JPEG format', async () => {
      const tweet = cloneTweet();
      await renderTweetToImage(tweet, { format: 'jpeg' });
      expect(sharpFn._instance.jpeg).toHaveBeenCalledWith({ quality: 90 });
      expect(sharpFn._instance.png).not.toHaveBeenCalled();
      expect(sharpFn._instance.webp).not.toHaveBeenCalled();
    });

    it('calls sharp.webp() with quality 85 for WebP format', async () => {
      const tweet = cloneTweet();
      await renderTweetToImage(tweet, { format: 'webp' });
      expect(sharpFn._instance.webp).toHaveBeenCalledWith({ quality: 85 });
      expect(sharpFn._instance.png).not.toHaveBeenCalled();
      expect(sharpFn._instance.jpeg).not.toHaveBeenCalled();
    });

    it('calls sharp.png() for default PNG format (no jpeg/webp)', async () => {
      const tweet = cloneTweet();
      await renderTweetToImage(tweet, { format: 'png' });
      expect(sharpFn._instance.png).toHaveBeenCalled();
      expect(sharpFn._instance.jpeg).not.toHaveBeenCalled();
      expect(sharpFn._instance.webp).not.toHaveBeenCalled();
    });

    it('still applies SSAA (resize + sharpen) for JPEG format', async () => {
      const tweet = cloneTweet();
      await renderTweetToImage(tweet, { format: 'jpeg', scale: 2, width: 550 });
      expect(sharpFn._instance.resize).toHaveBeenCalledWith(
        1100, null, { kernel: 'lanczos3' }
      );
      expect(sharpFn._instance.sharpen).toHaveBeenCalledWith({ sigma: 0.5 });
    });

    it('still applies SSAA (resize + sharpen) for WebP format', async () => {
      const tweet = cloneTweet();
      await renderTweetToImage(tweet, { format: 'webp', scale: 2, width: 550 });
      expect(sharpFn._instance.resize).toHaveBeenCalledWith(
        1100, null, { kernel: 'lanczos3' }
      );
      expect(sharpFn._instance.sharpen).toHaveBeenCalledWith({ sigma: 0.5 });
    });

    it('pipes through sharp for JPEG even when SSAA is skipped (skip-SSAA path)', async () => {
      const tweet = cloneTweet();
      // outputWidth=5000 → internal 15000 > 8000 → skips SSAA
      await renderTweetToImage(tweet, { format: 'jpeg', outputWidth: 5000 });
      expect(sharpFn._instance.jpeg).toHaveBeenCalledWith({ quality: 90 });
      // SSAA resize/sharpen should be skipped
      expect(sharpFn._instance.resize).not.toHaveBeenCalled();
      expect(sharpFn._instance.sharpen).not.toHaveBeenCalled();
    });

    it('pipes through sharp for WebP even when SSAA is skipped (skip-SSAA path)', async () => {
      const tweet = cloneTweet();
      // outputWidth=5000 → internal 15000 > 8000 → skips SSAA
      await renderTweetToImage(tweet, { format: 'webp', outputWidth: 5000 });
      expect(sharpFn._instance.webp).toHaveBeenCalledWith({ quality: 85 });
      // SSAA resize/sharpen should be skipped
      expect(sharpFn._instance.resize).not.toHaveBeenCalled();
      expect(sharpFn._instance.sharpen).not.toHaveBeenCalled();
    });
  });

  it('passes loadAdditionalAsset that handles emoji and language codes', async () => {
    const tweet = cloneTweet();
    await renderTweetToImage(tweet);
    const satoriCall = satori.mock.calls[0];
    const options = satoriCall[1];
    expect(options.loadAdditionalAsset).toBeDefined();
    expect(typeof options.loadAdditionalAsset).toBe('function');

    // Emoji: delegates to fetchEmoji (mocked)
    const emojiResult = await options.loadAdditionalAsset('emoji', '🎉');
    expect(emojiResult).toMatch(/^data:image\/svg\+xml;base64,/);

    // Language code: delegates to loadLanguageFont (mocked → undefined)
    const langResult = await options.loadAdditionalAsset('ja-JP', 'テスト');
    expect(langResult).toBeUndefined();
  });

  it('passes VDOM object (not string) to satori after HTML parsing', async () => {
    const tweet = cloneTweet({
      mediaDetails: [{ media_url_https: 'https://pbs.twimg.com/media/test.jpg' }],
    });
    await renderTweetToImage(tweet);
    // satori receives a VDOM object (from satori-html), not an HTML string
    const vdom = satori.mock.calls[0][0];
    expect(typeof vdom).toBe('object');
    expect(vdom.type).toBeDefined();
    expect(vdom.props).toBeDefined();
  });

  it('does not mutate tweet when rendering with quote tweet media', async () => {
    const tweet = cloneTweet({
      mediaDetails: [{ media_url_https: 'https://pbs.twimg.com/media/main.jpg' }],
      quoted_tweet: {
        text: 'quoted',
        user: { name: 'Qt', screen_name: 'qt', profile_image_url_https: 'https://pbs.twimg.com/qt_profile.jpg' },
        mediaDetails: [{ media_url_https: 'https://pbs.twimg.com/media/qt_media.jpg' }],
      },
    });
    const originalMainUrl = tweet.mediaDetails[0].media_url_https;
    const originalQtProfileUrl = tweet.quoted_tweet.user.profile_image_url_https;
    const originalQtMediaUrl = tweet.quoted_tweet.mediaDetails[0].media_url_https;
    await renderTweetToImage(tweet);
    // None of the tweet URLs should be mutated
    expect(tweet.mediaDetails[0].media_url_https).toBe(originalMainUrl);
    expect(tweet.quoted_tweet.user.profile_image_url_https).toBe(originalQtProfileUrl);
    expect(tweet.quoted_tweet.mediaDetails[0].media_url_https).toBe(originalQtMediaUrl);
  });

  // ─── Custom font tests ──────────────────────────────────────────────────

  it('uses custom font when fontUrl is provided', async () => {
    const tweet = cloneTweet();
    const fakeFontData = new ArrayBuffer(64);
    new Uint8Array(fakeFontData).set(Buffer.from('wOFF'));

    globalThis.fetch = vi.fn(async (url) => {
      if (url === 'https://example.com/custom-font.woff') {
        return {
          ok: true,
          arrayBuffer: async () => fakeFontData,
          headers: { get: () => 'font/woff' },
        };
      }
      // Default image response for pre-fetches
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4),
        headers: { get: () => 'image/png' },
      };
    });

    await renderTweetToImage(tweet, {
      fontUrl: 'https://example.com/custom-font.woff',
      fontFamily: 'MyCustomFont',
    });

    const satoriCall = satori.mock.calls[0];
    const fonts = satoriCall[1].fonts;
    expect(fonts).toHaveLength(2);
    expect(fonts[0].name).toBe('MyCustomFont');
    expect(fonts[0].weight).toBe(400);
    expect(fonts[1].name).toBe('MyCustomFont');
    expect(fonts[1].weight).toBe(700);
  });

  it('defaults fontFamily to "CustomFont" when fontUrl given without fontFamily', async () => {
    const tweet = cloneTweet();
    const fakeFontData = new ArrayBuffer(64);

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => fakeFontData,
      headers: { get: () => 'font/woff' },
    }));

    await renderTweetToImage(tweet, {
      fontUrl: 'https://example.com/font.woff',
    });

    const satoriCall = satori.mock.calls[0];
    const fonts = satoriCall[1].fonts;
    expect(fonts[0].name).toBe('CustomFont');
    expect(fonts[1].name).toBe('CustomFont');
  });

  it('uses separate bold font when fontBoldUrl is provided', async () => {
    const tweet = cloneTweet();
    const regularData = new ArrayBuffer(64);
    const boldData = new ArrayBuffer(128);

    globalThis.fetch = vi.fn(async (url) => {
      if (url === 'https://example.com/font-bold.woff') {
        return {
          ok: true,
          arrayBuffer: async () => boldData,
          headers: { get: () => 'font/woff' },
        };
      }
      return {
        ok: true,
        arrayBuffer: async () => regularData,
        headers: { get: () => 'font/woff' },
      };
    });

    await renderTweetToImage(tweet, {
      fontUrl: 'https://example.com/font.woff',
      fontBoldUrl: 'https://example.com/font-bold.woff',
      fontFamily: 'DualFont',
    });

    const satoriCall = satori.mock.calls[0];
    const fonts = satoriCall[1].fonts;
    expect(fonts).toHaveLength(2);
    expect(fonts[0].weight).toBe(400);
    expect(fonts[0].data).toBe(regularData);
    expect(fonts[1].weight).toBe(700);
    expect(fonts[1].data).toBe(boldData);
  });

  it('falls back to default Inter fonts when custom font fetch fails', async () => {
    const tweet = cloneTweet();

    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('custom-font')) {
        return { ok: false, status: 404, headers: { get: () => null } };
      }
      return {
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4),
        headers: { get: () => 'image/png' },
      };
    });

    await renderTweetToImage(tweet, {
      fontUrl: 'https://example.com/custom-font.woff',
      fontFamily: 'FailFont',
    });

    const satoriCall = satori.mock.calls[0];
    const fonts = satoriCall[1].fonts;
    // Should have fallen back to Inter fonts (loaded from mocked fs)
    expect(fonts[0].name).toBe('Inter');
  });

  it('passes fontFamily through to HTML generation', async () => {
    const tweet = cloneTweet();

    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(4),
      headers: { get: () => 'image/png' },
    }));

    await renderTweetToImage(tweet, { fontFamily: 'Roboto' });

    // satori-html's html() mock receives the HTML string — check it has the font family
    const htmlCall = html.mock.calls[0][0];
    expect(htmlCall).toContain('Roboto');
  });
});

// ─── Constants exports ───────────────────────────────────────────────────────

describe('exported constants', () => {
  it('THEMES has light, dark, dim, black', () => {
    expect(Object.keys(THEMES)).toEqual(expect.arrayContaining(['light', 'dark', 'dim', 'black']));
  });

  it('DIMENSIONS has auto and social presets', () => {
    expect(DIMENSIONS.auto).toEqual({ width: 550, height: null });
    expect(DIMENSIONS.instagramFeed).toEqual({ width: 1080, height: 1080 });
  });

  it('GRADIENTS has all preset names', () => {
    expect(Object.keys(GRADIENTS)).toEqual(
      expect.arrayContaining(['sunset', 'ocean', 'forest', 'fire', 'midnight', 'sky', 'candy', 'peach'])
    );
  });

  it('each theme has required color keys', () => {
    for (const [name, theme] of Object.entries(THEMES)) {
      expect(theme).toHaveProperty('bg');
      expect(theme).toHaveProperty('text');
      expect(theme).toHaveProperty('textSecondary');
      expect(theme).toHaveProperty('border');
      expect(theme).toHaveProperty('link');
    }
  });

  it('FORMAT_CONTENT_TYPES maps all supported formats', () => {
    expect(FORMAT_CONTENT_TYPES).toEqual({
      png: 'image/png',
      svg: 'image/svg+xml',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
    });
  });

  it('FORMAT_CONTENT_TYPES has correct MIME type for each format', () => {
    expect(FORMAT_CONTENT_TYPES.png).toBe('image/png');
    expect(FORMAT_CONTENT_TYPES.svg).toBe('image/svg+xml');
    expect(FORMAT_CONTENT_TYPES.jpeg).toBe('image/jpeg');
    expect(FORMAT_CONTENT_TYPES.webp).toBe('image/webp');
  });
});
