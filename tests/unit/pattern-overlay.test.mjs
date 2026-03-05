/**
 * Unit tests for background pattern overlay compositing.
 * Tests pattern rendering in renderTweetToImage / renderThreadToImage:
 *   - Pattern applied on gradient/canvas renders (needsWrapper=true)
 *   - Pattern NOT applied on standalone renders (needsWrapper=false)
 *   - Pattern NOT applied when bgImage is present (bgImage takes priority)
 *   - Unknown pattern type gracefully skips compositing
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

// Track sharp calls — composite is the key call we verify for pattern overlay
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
    metadata: vi.fn(async () => ({ width: 1260, height: 900 })),
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

const { renderTweetToImage, renderThreadToImage } = await import('../../tweet-render.mjs');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cloneTweet(overrides = {}) {
  return structuredClone({ ...MOCK_TWEET, ...overrides });
}

function stubFetchOk() {
  return vi.fn(async () => {
    const imageData = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const ab = new ArrayBuffer(imageData.length);
    new Uint8Array(ab).set(imageData);
    return {
      ok: true,
      arrayBuffer: async () => ab,
      headers: { get: () => 'image/png' },
    };
  });
}

// ─── renderTweetToImage with pattern ─────────────────────────────────────────

describe('renderTweetToImage with pattern overlay', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = stubFetchOk();
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('composites pattern overlay when pattern + gradient are set', async () => {
    const tweet = cloneTweet();
    await renderTweetToImage(tweet, {
      pattern: 'dots',
      backgroundGradient: 'sunset',
    });

    // Pattern compositing uses sharp.composite with blend: 'over'
    expect(sharpFn._instance.composite).toHaveBeenCalledWith([
      { input: expect.any(Buffer), blend: 'over' },
    ]);
  });

  it('composites pattern overlay when pattern + custom gradient (gradientFrom/To) are set', async () => {
    const tweet = cloneTweet();
    await renderTweetToImage(tweet, {
      pattern: 'grid',
      gradientFrom: '#ff0000',
      gradientTo: '#0000ff',
    });

    expect(sharpFn._instance.composite).toHaveBeenCalledWith([
      { input: expect.any(Buffer), blend: 'over' },
    ]);
  });

  it('composites pattern overlay when pattern + dimension preset are set', async () => {
    const tweet = cloneTweet();
    await renderTweetToImage(tweet, {
      pattern: 'stripes',
      canvasWidth: 1080,
      canvasHeight: 1080,
    });

    // canvasWidth + canvasHeight → hasFixedDimensions=true → needsWrapper=true
    expect(sharpFn._instance.composite).toHaveBeenCalledWith([
      { input: expect.any(Buffer), blend: 'over' },
    ]);
  });

  it('does NOT composite pattern on standalone render (no gradient/canvas)', async () => {
    const tweet = cloneTweet();
    await renderTweetToImage(tweet, {
      pattern: 'dots',
      // No gradient, no bgImage, no canvasWidth/canvasHeight → standalone
    });

    // Pattern should NOT be applied — needsWrapper is false
    expect(sharpFn._instance.composite).not.toHaveBeenCalled();
  });

  it('does NOT composite pattern when bgImage is present (bgImage takes priority)', async () => {
    const tweet = cloneTweet();
    // Reset composite to check it's not called for pattern
    sharpFn._instance.composite.mockClear();

    await renderTweetToImage(tweet, {
      pattern: 'dots',
      backgroundGradient: 'sunset',
      bgImage: 'https://example.com/bg.jpg',
    });

    // bgImage compositing calls composite, but pattern compositing should be skipped
    // The composite call should be for bgImage (gravity: 'center'), NOT pattern (blend: 'over')
    const compositeCalls = sharpFn._instance.composite.mock.calls;
    const patternCalls = compositeCalls.filter(call =>
      call[0]?.some?.(item => item.blend === 'over')
    );
    expect(patternCalls).toHaveLength(0);
  });

  it('skips compositing when pattern type is unknown (null from generatePatternSvg)', async () => {
    const tweet = cloneTweet();
    await renderTweetToImage(tweet, {
      pattern: 'checkerboard', // Unknown type
      backgroundGradient: 'sunset',
    });

    // generatePatternSvg returns null → renderPatternBuffer returns null → no composite
    expect(sharpFn._instance.composite).not.toHaveBeenCalled();
  });

  it('does not apply pattern for SVG format (pattern is raster-only)', async () => {
    const tweet = cloneTweet();
    await renderTweetToImage(tweet, {
      pattern: 'dots',
      backgroundGradient: 'sunset',
      format: 'svg',
    });

    // SVG returns before the raster compositing step
    expect(sharpFn._instance.composite).not.toHaveBeenCalled();
  });

  it('passes patternColor and patternSpacing through to the pattern buffer', async () => {
    // We can't easily verify the SVG content inside the Resvg mock,
    // but we can verify that the render function runs without error
    // when custom pattern options are provided
    const tweet = cloneTweet();
    await renderTweetToImage(tweet, {
      pattern: 'waves',
      patternColor: '#ff0000',
      patternSpacing: 50,
      backgroundGradient: 'ocean',
    });

    // Pattern compositing should still happen
    expect(sharpFn._instance.composite).toHaveBeenCalledWith([
      { input: expect.any(Buffer), blend: 'over' },
    ]);
  });
});

// ─── renderThreadToImage with pattern ────────────────────────────────────────

describe('renderThreadToImage with pattern overlay', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = stubFetchOk();
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('composites pattern overlay on thread render with gradient', async () => {
    const tweets = [cloneTweet(), cloneTweet({ text: 'Second tweet' })];
    await renderThreadToImage(tweets, {
      pattern: 'diagonal',
      backgroundGradient: 'fire',
    });

    expect(sharpFn._instance.composite).toHaveBeenCalledWith([
      { input: expect.any(Buffer), blend: 'over' },
    ]);
  });

  it('does NOT composite pattern on standalone thread render', async () => {
    const tweets = [cloneTweet(), cloneTweet({ text: 'Second tweet' })];
    await renderThreadToImage(tweets, {
      pattern: 'dots',
      // No gradient, no canvasWidth/canvasHeight → standalone
    });

    expect(sharpFn._instance.composite).not.toHaveBeenCalled();
  });

  it('does NOT composite pattern on thread render when bgImage is present', async () => {
    const tweets = [cloneTweet()];
    sharpFn._instance.composite.mockClear();

    await renderThreadToImage(tweets, {
      pattern: 'grid',
      backgroundGradient: 'ocean',
      bgImage: 'https://example.com/bg.jpg',
    });

    // Should have composite calls for bgImage, but not for pattern
    const compositeCalls = sharpFn._instance.composite.mock.calls;
    const patternCalls = compositeCalls.filter(call =>
      call[0]?.some?.(item => item.blend === 'over')
    );
    expect(patternCalls).toHaveLength(0);
  });

  it('does not apply pattern for SVG format in thread render', async () => {
    const tweets = [cloneTweet()];
    await renderThreadToImage(tweets, {
      pattern: 'dots',
      backgroundGradient: 'sunset',
      format: 'svg',
    });

    expect(sharpFn._instance.composite).not.toHaveBeenCalled();
  });
});
