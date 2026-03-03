/**
 * Unit tests for core.mjs — rendering core shared by CLI and API.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MOCK_TWEET } from '../helpers/test-fixtures.mjs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

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
const { html } = await import('satori-html');

const {
  extractTweetId,
  fetchTweet,
  fetchThread,
  translateText,
  fetchImageAsBase64,
  formatDate,
  formatNumber,
  generateTweetHtml,
  addLogoToHtml,
  renderTweetToImage,
  THEMES,
  DIMENSIONS,
  GRADIENTS,
} = await import('../../core.mjs');

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

// ─── addLogoToHtml ───────────────────────────────────────────────────────────

describe('addLogoToHtml', () => {
  const sampleHtml = '<div style="display: flex;">content</div>';

  it('inserts logo img before closing </div>', () => {
    const result = addLogoToHtml(sampleHtml, 'https://example.com/logo.png');
    expect(result).toContain('img');
    expect(result).toContain('https://example.com/logo.png');
    expect(result).toContain('</div>');
  });

  it('uses bottom-right as default position', () => {
    const result = addLogoToHtml(sampleHtml, 'logo.png');
    expect(result).toContain('bottom: 10px');
    expect(result).toContain('right: 10px');
  });

  it('uses provided position', () => {
    const result = addLogoToHtml(sampleHtml, 'logo.png', 'top-left');
    expect(result).toContain('top: 10px');
    expect(result).toContain('left: 10px');
  });

  it('falls back to bottom-right for invalid position', () => {
    const result = addLogoToHtml(sampleHtml, 'logo.png', 'center');
    expect(result).toContain('bottom: 10px');
    expect(result).toContain('right: 10px');
  });

  it('applies custom size', () => {
    const result = addLogoToHtml(sampleHtml, 'logo.png', 'bottom-right', 80);
    expect(result).toContain('width: 80px');
    expect(result).toContain('height: 80px');
  });

  it('uses position: absolute (known broken in Satori)', () => {
    const result = addLogoToHtml(sampleHtml, 'logo.png');
    expect(result).toContain('position: absolute');
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

  it('throws on non-ok HTTP response', async () => {
    globalThis.fetch = vi.fn(async () => mockFetchResponse({}, { ok: false, status: 404, statusText: 'Not Found' }));

    await expect(fetchTweet('999')).rejects.toThrow('Tweet not found or is no longer available');
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

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await fetchThread('100');
    expect(result).toHaveLength(1);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('logs warning and stops walking on non-404 error (e.g., 429 rate limit)', async () => {
    const child = { text: 'child', user: { screen_name: 'user1' }, parent: { id_str: '50' } };

    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) return mockFetchResponse(child);
      return mockFetchResponse({}, { ok: false, status: 429, statusText: 'Too Many Requests' });
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await fetchThread('100');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('child');
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('Thread walk halted');
    warnSpy.mockRestore();
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

  it('pre-fetches profile image to base64', async () => {
    const tweet = cloneTweet();
    const originalProfileUrl = tweet.user.profile_image_url_https;
    await renderTweetToImage(tweet);
    // After rendering, the tweet object is mutated — profile URL replaced with data URI
    expect(tweet.user.profile_image_url_https).not.toBe(originalProfileUrl);
    expect(tweet.user.profile_image_url_https).toMatch(/^data:/);
  });

  it('pre-fetches media images to base64', async () => {
    const tweet = cloneTweet({
      mediaDetails: [{ media_url_https: 'https://pbs.twimg.com/media/test.jpg' }],
    });
    await renderTweetToImage(tweet);
    expect(tweet.mediaDetails[0].media_url_https).toMatch(/^data:/);
  });

  it('pre-fetches quote tweet images', async () => {
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
    await renderTweetToImage(tweet);
    expect(tweet.quoted_tweet.user.profile_image_url_https).toMatch(/^data:/);
  });

  it('calls satori with appropriate dimensions', async () => {
    const tweet = cloneTweet();
    await renderTweetToImage(tweet, { width: 600, padding: 20 });
    expect(satori).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        width: 640, // 600 + 20*2
      })
    );
  });

  it('applies scale factor to Resvg width', async () => {
    const tweet = cloneTweet();
    await renderTweetToImage(tweet, { scale: 2, width: 550, padding: 20 });
    expect(Resvg).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fitTo: { mode: 'width', value: (550 + 40) * 2 },
      })
    );
  });

  it('passes loadAdditionalAsset that returns undefined', async () => {
    const tweet = cloneTweet();
    await renderTweetToImage(tweet);
    const satoriCall = satori.mock.calls[0];
    const options = satoriCall[1];
    expect(options.loadAdditionalAsset).toBeDefined();
    const result = await options.loadAdditionalAsset('emoji', '🎉');
    expect(result).toBeUndefined();
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
});
