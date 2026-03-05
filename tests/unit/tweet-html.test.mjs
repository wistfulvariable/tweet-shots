/**
 * Unit tests for tweet-html.mjs — HTML template generation.
 * Tests new features: multi-image grid, logo placement, custom gradient,
 * phone frame, and thread HTML generation.
 */

import { describe, it, expect } from 'vitest';
import {
  generateTweetHtml,
  generateThreadHtml,
  buildShadowCss,
  generatePatternSvg,
  GRADIENTS,
  PHONE_CHROME,
  WATERMARK_COLORS,
  HEIGHT_WATERMARK,
  SHADOW_STYLES,
  SHADOW_INTENSITIES,
  SHADOW_DIRECTIONS,
  PATTERN_TYPES,
} from '../../tweet-html.mjs';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseTweet = {
  id_str: '1',
  text: 'Hello world',
  created_at: '2024-01-15T12:00:00.000Z',
  user: {
    name: 'Test User',
    screen_name: 'testuser',
    profile_image_url_https: 'https://pbs.twimg.com/profile_images/test/photo_normal.jpg',
    is_blue_verified: false,
  },
  favorite_count: 100,
  retweet_count: 50,
  conversation_count: 10,
  entities: { hashtags: [], urls: [], user_mentions: [] },
  mediaDetails: [],
  photos: [],
};

function tweetWith(mediaDetails = [], photos = []) {
  return { ...baseTweet, mediaDetails, photos };
}

const imgUrl = (i) => `https://pbs.twimg.com/media/img${i}.jpg`;

// ─── Multi-image grid ─────────────────────────────────────────────────────────

describe('multi-image grid', () => {
  it('renders no media block when tweet has no images', () => {
    const html = generateTweetHtml(baseTweet, 'dark', {});
    expect(html).not.toContain('object-fit: cover');
  });

  it('renders a single image at full width (280px height)', () => {
    const tweet = tweetWith([{ media_url_https: imgUrl(1) }]);
    const html = generateTweetHtml(tweet, 'dark', { padding: 20 });
    expect(html).toContain(imgUrl(1));
    expect(html).toContain('height: 280px');
    // Should NOT contain 220px (2-image height)
    expect(html).not.toContain('height: 220px');
  });

  it('renders two images side-by-side at 220px height', () => {
    const tweet = tweetWith([
      { media_url_https: imgUrl(1) },
      { media_url_https: imgUrl(2) },
    ]);
    const html = generateTweetHtml(tweet, 'dark', { padding: 20 });
    expect(html).toContain(imgUrl(1));
    expect(html).toContain(imgUrl(2));
    expect(html).toContain('height: 220px');
    expect(html).not.toContain('height: 280px');
  });

  it('renders three images with a stacked right column', () => {
    const tweet = tweetWith([
      { media_url_https: imgUrl(1) },
      { media_url_https: imgUrl(2) },
      { media_url_https: imgUrl(3) },
    ]);
    const html = generateTweetHtml(tweet, 'dark', { padding: 20 });
    expect(html).toContain(imgUrl(1));
    expect(html).toContain(imgUrl(2));
    expect(html).toContain(imgUrl(3));
    // Right column has two stacked images at half height
    expect(html).toContain('flex-direction: column');
  });

  it('renders four images in 2×2 grid at 160px each', () => {
    const tweet = tweetWith([
      { media_url_https: imgUrl(1) },
      { media_url_https: imgUrl(2) },
      { media_url_https: imgUrl(3) },
      { media_url_https: imgUrl(4) },
    ]);
    const html = generateTweetHtml(tweet, 'dark', { padding: 20 });
    for (let i = 1; i <= 4; i++) expect(html).toContain(imgUrl(i));
    expect(html).toContain('height: 160px');
  });

  it('shows images from photos array when mediaDetails is empty', () => {
    const tweet = tweetWith([], [
      { url: imgUrl(1) },
      { url: imgUrl(2) },
    ]);
    const html = generateTweetHtml(tweet, 'dark', {});
    expect(html).toContain(imgUrl(1));
    expect(html).toContain(imgUrl(2));
    expect(html).toContain('height: 220px');
  });

  it('hides media when hideMedia=true', () => {
    const tweet = tweetWith([{ media_url_https: imgUrl(1) }]);
    const html = generateTweetHtml(tweet, 'dark', { hideMedia: true });
    expect(html).not.toContain(imgUrl(1));
  });
});

// ─── Logo placement ───────────────────────────────────────────────────────────

describe('logo placement', () => {
  const logoUrl = 'https://example.com/logo.png';

  it('does not render logo row when no logo option', () => {
    const html = generateTweetHtml(baseTweet, 'dark', {});
    expect(html).not.toContain(logoUrl);
  });

  it('renders logo with default bottom-right alignment', () => {
    const html = generateTweetHtml(baseTweet, 'dark', { logo: logoUrl });
    expect(html).toContain(logoUrl);
    expect(html).toContain('justify-content: flex-end');
  });

  it('renders logo with top-left alignment', () => {
    const html = generateTweetHtml(baseTweet, 'dark', {
      logo: logoUrl,
      logoPosition: 'top-left',
    });
    expect(html).toContain(logoUrl);
    expect(html).toContain('justify-content: flex-start');
  });

  it('renders logo with top-right alignment', () => {
    const html = generateTweetHtml(baseTweet, 'dark', {
      logo: logoUrl,
      logoPosition: 'top-right',
    });
    expect(html).toContain(logoUrl);
    expect(html).toContain('justify-content: flex-end');
  });

  it('renders logo with bottom-left alignment', () => {
    const html = generateTweetHtml(baseTweet, 'dark', {
      logo: logoUrl,
      logoPosition: 'bottom-left',
    });
    expect(html).toContain(logoUrl);
    expect(html).toContain('justify-content: flex-start');
  });

  it('respects custom logoSize', () => {
    const html = generateTweetHtml(baseTweet, 'dark', {
      logo: logoUrl,
      logoSize: 80,
    });
    expect(html).toContain('width: 80px');
    expect(html).toContain('height: 80px');
  });

  it('does not use position:absolute (would break Satori)', () => {
    const html = generateTweetHtml(baseTweet, 'dark', {
      logo: logoUrl,
      logoPosition: 'bottom-right',
    });
    expect(html).not.toContain('position: absolute');
    expect(html).not.toContain('position:absolute');
  });
});

// ─── Custom gradient ──────────────────────────────────────────────────────────

describe('custom gradient', () => {
  it('renders custom gradient from gradientFrom/gradientTo', () => {
    const html = generateTweetHtml(baseTweet, 'dark', {
      gradientFrom: '#ff0000',
      gradientTo: '#0000ff',
    });
    expect(html).toContain('linear-gradient(135deg, #ff0000 0%, #0000ff 100%)');
  });

  it('uses gradientAngle when provided', () => {
    const html = generateTweetHtml(baseTweet, 'dark', {
      gradientFrom: '#ff0000',
      gradientTo: '#0000ff',
      gradientAngle: 90,
    });
    expect(html).toContain('linear-gradient(90deg, #ff0000 0%, #0000ff 100%)');
  });

  it('uses named gradient when no custom gradient provided', () => {
    const html = generateTweetHtml(baseTweet, 'dark', {
      backgroundGradient: 'sunset',
    });
    expect(html).toContain(GRADIENTS.sunset);
  });

  it('custom gradient takes priority over named backgroundGradient', () => {
    const html = generateTweetHtml(baseTweet, 'dark', {
      backgroundGradient: 'sunset',
      gradientFrom: '#aabbcc',
      gradientTo: '#112233',
    });
    expect(html).toContain('linear-gradient(135deg, #aabbcc 0%, #112233 100%)');
    expect(html).not.toContain(GRADIENTS.sunset);
  });

  it('does not add gradient wrapper when only gradientFrom is provided', () => {
    // Gradient requires both from AND to
    const html = generateTweetHtml(baseTweet, 'dark', {
      gradientFrom: '#ff0000',
      // no gradientTo
    });
    expect(html).not.toContain('linear-gradient');
  });
});

// ─── Phone mockup frame ───────────────────────────────────────────────────────

describe('phone mockup frame', () => {
  it('renders phone chrome when frame="phone"', () => {
    const html = generateTweetHtml(baseTweet, 'dark', { frame: 'phone' });
    // Should contain notch (dynamic island pill)
    expect(html).toContain('width: 80px; height: 8px');
    // Should contain home bar
    expect(html).toContain('width: 100px; height: 4px');
    // Should contain dark bezel background
    expect(html).toContain('#0d0d0d');
    expect(html).toContain('#1a1a1a');
  });

  it('does not render phone chrome without frame option', () => {
    const html = generateTweetHtml(baseTweet, 'dark', {});
    // Notch pill should NOT appear without phone frame
    expect(html).not.toContain('width: 80px; height: 8px');
  });

  it('wraps phone in gradient background when both provided', () => {
    const html = generateTweetHtml(baseTweet, 'dark', {
      frame: 'phone',
      backgroundGradient: 'ocean',
      canvasWidth: 700,
      canvasHeight: 900,
    });
    expect(html).toContain(GRADIENTS.ocean);
    expect(html).toContain('#0d0d0d'); // phone bezel still present
  });

  it('PHONE_CHROME export has expected structure', () => {
    expect(PHONE_CHROME).toHaveProperty('border');
    expect(PHONE_CHROME).toHaveProperty('notch');
    expect(PHONE_CHROME).toHaveProperty('homeBar');
    expect(typeof PHONE_CHROME.border).toBe('number');
    expect(typeof PHONE_CHROME.notch).toBe('number');
    expect(typeof PHONE_CHROME.homeBar).toBe('number');
  });

  it('does not use position:absolute in phone frame (Satori incompatible)', () => {
    const html = generateTweetHtml(baseTweet, 'dark', { frame: 'phone' });
    expect(html).not.toContain('position: absolute');
  });
});

// ─── Thread HTML generation ───────────────────────────────────────────────────

describe('generateThreadHtml', () => {
  const threadTweets = [
    {
      ...baseTweet,
      id_str: '1',
      text: 'First tweet in thread',
      retweet_count: 10,
      favorite_count: 20,
    },
    {
      ...baseTweet,
      id_str: '2',
      text: 'Second tweet in thread',
      retweet_count: 5,
      favorite_count: 15,
    },
    {
      ...baseTweet,
      id_str: '3',
      text: 'Third tweet in thread',
      retweet_count: 2,
      favorite_count: 8,
    },
  ];

  it('includes all tweet texts', () => {
    const html = generateThreadHtml(threadTweets, 'dark', {});
    expect(html).toContain('First tweet in thread');
    expect(html).toContain('Second tweet in thread');
    expect(html).toContain('Third tweet in thread');
  });

  it('includes connector lines between tweets (all but last)', () => {
    const html = generateThreadHtml(threadTweets, 'dark', {});
    // Connector: thin vertical line (width: 2px)
    const connectorMatches = html.match(/width: 2px/g) || [];
    // Should have at least 2 connector lines (n-1 connectors for n tweets)
    expect(connectorMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('includes avatar images for all tweets', () => {
    const profileUrl = 'https://pbs.twimg.com/profile_images/test/photo_400x400.jpg';
    const html = generateThreadHtml(threadTweets, 'dark', {});
    // All tweets share the same profile URL in fixture
    expect(html).toContain(profileUrl);
  });

  it('renders gradient wrapper when backgroundGradient provided', () => {
    const html = generateThreadHtml(threadTweets, 'dark', {
      backgroundGradient: 'fire',
    });
    expect(html).toContain(GRADIENTS.fire);
  });

  it('renders custom gradient in thread', () => {
    const html = generateThreadHtml(threadTweets, 'dark', {
      gradientFrom: '#123456',
      gradientTo: '#654321',
    });
    expect(html).toContain('linear-gradient(135deg, #123456 0%, #654321 100%)');
  });

  it('shows metrics by default (retweet + like counts)', () => {
    const html = generateThreadHtml(threadTweets, 'dark', { showMetrics: true });
    expect(html).toContain('10'); // retweet count of first tweet
    expect(html).toContain('20'); // like count of first tweet
  });

  it('hides metrics when showMetrics=false', () => {
    // Without metrics, no metric SVG icons should appear
    const htmlWith = generateThreadHtml(threadTweets, 'dark', { showMetrics: true });
    const htmlWithout = generateThreadHtml(threadTweets, 'dark', { showMetrics: false });
    expect(htmlWith.length).toBeGreaterThan(htmlWithout.length);
  });

  it('hides media when hideMedia=true', () => {
    const tweetWithMedia = {
      ...threadTweets[0],
      mediaDetails: [{ media_url_https: imgUrl(1) }],
    };
    const tweets = [tweetWithMedia, threadTweets[1]];
    const htmlHidden = generateThreadHtml(tweets, 'dark', { hideMedia: true });
    expect(htmlHidden).not.toContain(imgUrl(1));
  });

  it('handles single-tweet thread (no connector line)', () => {
    const html = generateThreadHtml([threadTweets[0]], 'dark', {});
    // For a single-tweet thread, there should be no connector lines
    // The connector is a 2px wide vertical line between tweets
    expect(html).not.toContain('width: 2px');
    expect(html).toContain('First tweet in thread');
  });
});

// ─── Watermark ─────────────────────────────────────────────────────────────────

describe('watermark', () => {
  describe('generateTweetHtml', () => {
    it('does not render watermark by default (watermark=false)', () => {
      const html = generateTweetHtml(baseTweet, 'dark', {});
      expect(html).not.toContain('tweet-shots.com');
    });

    it('renders watermark text when watermark=true', () => {
      const html = generateTweetHtml(baseTweet, 'dark', { watermark: true });
      expect(html).toContain('tweet-shots.com');
    });

    it('uses correct color for light theme', () => {
      const html = generateTweetHtml(baseTweet, 'light', { watermark: true });
      expect(html).toContain(WATERMARK_COLORS.light);
      expect(html).toContain('tweet-shots.com');
    });

    it('uses correct color for dark theme', () => {
      const html = generateTweetHtml(baseTweet, 'dark', { watermark: true });
      expect(html).toContain(WATERMARK_COLORS.dark);
    });

    it('uses correct color for dim theme', () => {
      const html = generateTweetHtml(baseTweet, 'dim', { watermark: true });
      expect(html).toContain(WATERMARK_COLORS.dim);
    });

    it('uses correct color for black theme', () => {
      const html = generateTweetHtml(baseTweet, 'black', { watermark: true });
      expect(html).toContain(WATERMARK_COLORS.black);
    });

    it('watermark appears after logo when both are present', () => {
      const logoUrl = 'https://example.com/logo.png';
      const html = generateTweetHtml(baseTweet, 'dark', {
        watermark: true,
        logo: logoUrl,
        logoPosition: 'bottom-right',
      });
      const logoIdx = html.indexOf(logoUrl);
      const watermarkIdx = html.indexOf('tweet-shots.com');
      expect(logoIdx).toBeGreaterThan(-1);
      expect(watermarkIdx).toBeGreaterThan(-1);
      expect(watermarkIdx).toBeGreaterThan(logoIdx);
    });

    it('watermark uses only flexbox layout (Satori-compatible)', () => {
      const html = generateTweetHtml(baseTweet, 'dark', { watermark: true });
      // Watermark section should not use position: absolute (Satori rejects it)
      const watermarkStart = html.indexOf('tweet-shots.com');
      // Check the watermark container div (within ~200 chars before the text)
      const watermarkSection = html.slice(Math.max(0, watermarkStart - 200), watermarkStart);
      expect(watermarkSection).not.toContain('position: absolute');
      expect(watermarkSection).toContain('display: flex');
    });

    it('watermark renders with gradient background', () => {
      const html = generateTweetHtml(baseTweet, 'dark', {
        watermark: true,
        backgroundGradient: 'sunset',
      });
      expect(html).toContain('tweet-shots.com');
      expect(html).toContain('linear-gradient');
    });
  });

  describe('generateThreadHtml', () => {
    const threadTweets = [
      { ...baseTweet, id_str: '1', text: 'Thread tweet 1' },
      { ...baseTweet, id_str: '2', text: 'Thread tweet 2' },
    ];

    it('renders watermark when watermark=true', () => {
      const html = generateThreadHtml(threadTweets, 'dark', { watermark: true });
      expect(html).toContain('tweet-shots.com');
    });

    it('does not render watermark when watermark=false (default)', () => {
      const html = generateThreadHtml(threadTweets, 'dark', {});
      expect(html).not.toContain('tweet-shots.com');
    });

    it('uses correct theme color for watermark', () => {
      const html = generateThreadHtml(threadTweets, 'light', { watermark: true });
      expect(html).toContain(WATERMARK_COLORS.light);
    });

    it('watermark appears after all thread content', () => {
      const html = generateThreadHtml(threadTweets, 'dark', { watermark: true });
      const lastTweetIdx = html.lastIndexOf('Thread tweet 2');
      const watermarkIdx = html.indexOf('tweet-shots.com');
      expect(watermarkIdx).toBeGreaterThan(lastTweetIdx);
    });
  });

  describe('HEIGHT_WATERMARK constant', () => {
    it('is a positive number', () => {
      expect(HEIGHT_WATERMARK).toBeGreaterThan(0);
    });

    it('is reasonable size (20-40px)', () => {
      expect(HEIGHT_WATERMARK).toBeGreaterThanOrEqual(20);
      expect(HEIGHT_WATERMARK).toBeLessThanOrEqual(40);
    });
  });
});

// ─── buildShadowCss ─────────────────────────────────────────────────────────

describe('buildShadowCss', () => {
  it('returns empty string when shadowStyle is "none"', () => {
    expect(buildShadowCss({ shadowStyle: 'none' })).toBe('');
  });

  it('returns empty string when shadowStyle is "none" even with needsWrapper=true', () => {
    expect(buildShadowCss({ shadowStyle: 'none', needsWrapper: true })).toBe('');
  });

  it('defaults (spread/medium/bottom) produce correct box-shadow', () => {
    const css = buildShadowCss();
    expect(css).toBe('box-shadow: 0px 8px 32px 0px rgba(0,0,0,0.35);');
  });

  it('hug style has blur 8 and spread 2', () => {
    const css = buildShadowCss({ shadowStyle: 'hug' });
    expect(css).toContain('8px'); // blur
    expect(css).toContain('2px'); // spread
    // Verify it does NOT contain 32px (the spread style's blur)
    expect(css).not.toContain('32px');
  });

  describe('directions produce correct dx/dy offsets', () => {
    const directionCases = [
      ['center',       '0px',  '0px'],
      ['top',          '0px',  '-8px'],
      ['top-right',    '8px',  '-8px'],
      ['right',        '8px',  '0px'],
      ['bottom-right', '8px',  '8px'],
      ['bottom',       '0px',  '8px'],
      ['bottom-left',  '-8px', '8px'],
      ['left',         '-8px', '0px'],
      ['top-left',     '-8px', '-8px'],
    ];

    it.each(directionCases)(
      '%s direction produces dx=%s dy=%s',
      (direction, expectedDx, expectedDy) => {
        const css = buildShadowCss({ shadowDirection: direction });
        // Parse: "box-shadow: <dx>px <dy>px ..."
        const match = css.match(/box-shadow:\s*(-?\d+)px\s+(-?\d+)px/);
        expect(match, `should produce valid box-shadow for direction "${direction}"`).not.toBeNull();
        expect(match[1] + 'px').toBe(expectedDx);
        expect(match[2] + 'px').toBe(expectedDy);
      }
    );
  });

  it('low intensity produces opacity 0.15', () => {
    const css = buildShadowCss({ shadowIntensity: 'low' });
    expect(css).toContain('rgba(0,0,0,0.15)');
  });

  it('medium intensity produces opacity 0.35', () => {
    const css = buildShadowCss({ shadowIntensity: 'medium' });
    expect(css).toContain('rgba(0,0,0,0.35)');
  });

  it('high intensity produces opacity 0.55', () => {
    const css = buildShadowCss({ shadowIntensity: 'high' });
    expect(css).toContain('rgba(0,0,0,0.55)');
  });

  it('hideShadow=true overrides to empty string', () => {
    const css = buildShadowCss({ hideShadow: true, needsWrapper: true, shadowStyle: 'spread' });
    expect(css).toBe('');
  });

  it('needsWrapper=false returns empty string', () => {
    const css = buildShadowCss({ needsWrapper: false, shadowStyle: 'spread' });
    expect(css).toBe('');
  });

  it('unknown shadowStyle falls back to spread', () => {
    const css = buildShadowCss({ shadowStyle: 'glow' });
    // Should use spread defaults: blur 32, spread 0
    expect(css).toContain('32px');
    expect(css).toContain('0px rgba');
  });

  it('unknown shadowDirection falls back to bottom [0, 1]', () => {
    const css = buildShadowCss({ shadowDirection: 'northwest' });
    const match = css.match(/box-shadow:\s*(-?\d+)px\s+(-?\d+)px/);
    expect(match).not.toBeNull();
    expect(match[1]).toBe('0');  // dx = 0
    expect(match[2]).toBe('8');  // dy = 8 (bottom)
  });

  it('SHADOW_STYLES export has expected keys', () => {
    expect(SHADOW_STYLES).toHaveProperty('none');
    expect(SHADOW_STYLES).toHaveProperty('spread');
    expect(SHADOW_STYLES).toHaveProperty('hug');
    expect(SHADOW_STYLES.none).toBeNull();
    expect(SHADOW_STYLES.spread).toEqual({ blur: 32, spread: 0 });
    expect(SHADOW_STYLES.hug).toEqual({ blur: 8, spread: 2 });
  });

  it('SHADOW_INTENSITIES export has expected values', () => {
    expect(SHADOW_INTENSITIES.low).toBe(0.15);
    expect(SHADOW_INTENSITIES.medium).toBe(0.35);
    expect(SHADOW_INTENSITIES.high).toBe(0.55);
  });

  it('SHADOW_DIRECTIONS export has all 9 directions', () => {
    const keys = Object.keys(SHADOW_DIRECTIONS);
    expect(keys).toHaveLength(9);
    expect(keys).toEqual(
      expect.arrayContaining(['center', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left'])
    );
  });
});

// ─── Shadow backward compat ─────────────────────────────────────────────────

describe('shadow backward compatibility', () => {
  it('generateTweetHtml with needsWrapper=true (gradient) produces box-shadow by default', () => {
    const html = generateTweetHtml(baseTweet, 'dark', {
      backgroundGradient: 'sunset',
    });
    expect(html).toContain('box-shadow:');
  });

  it('generateTweetHtml standalone (no gradient/canvas) produces NO shadow', () => {
    const html = generateTweetHtml(baseTweet, 'dark', {});
    expect(html).not.toContain('box-shadow:');
  });

  it('generateThreadHtml with gradient produces box-shadow by default', () => {
    const threadTweets = [
      { ...baseTweet, id_str: '1', text: 'First' },
      { ...baseTweet, id_str: '2', text: 'Second' },
    ];
    const html = generateThreadHtml(threadTweets, 'dark', {
      backgroundGradient: 'ocean',
    });
    expect(html).toContain('box-shadow:');
  });

  it('generateThreadHtml standalone produces NO shadow', () => {
    const threadTweets = [
      { ...baseTweet, id_str: '1', text: 'First' },
      { ...baseTweet, id_str: '2', text: 'Second' },
    ];
    const html = generateThreadHtml(threadTweets, 'dark', {});
    expect(html).not.toContain('box-shadow:');
  });

  it('generateTweetHtml custom shadow params override default', () => {
    const html = generateTweetHtml(baseTweet, 'dark', {
      backgroundGradient: 'sunset',
      shadowStyle: 'hug',
      shadowIntensity: 'low',
      shadowDirection: 'top',
    });
    // hug style: blur 8, spread 2
    expect(html).toContain('8px');
    // low intensity
    expect(html).toContain('0.15');
    // top direction: dy = -8
    expect(html).toContain('-8px');
  });
});

// ─── Pattern SVG generators ─────────────────────────────────────────────────

describe('PATTERN_TYPES export', () => {
  it('contains exactly 5 pattern names', () => {
    expect(PATTERN_TYPES).toHaveLength(5);
  });

  it('contains all expected pattern types', () => {
    expect(PATTERN_TYPES).toEqual(['dots', 'grid', 'stripes', 'waves', 'diagonal']);
  });
});

describe('generatePatternSvg', () => {
  it('returns valid SVG with <circle> for dots pattern', () => {
    const svg = generatePatternSvg('dots', 800, 600);
    expect(svg).not.toBeNull();
    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('<circle');
    expect(svg).toContain('fill="rgba(255,255,255,0.15)"');
    expect(svg).toContain('width="800"');
    expect(svg).toContain('height="600"');
  });

  it('returns valid SVG with <path> for grid pattern', () => {
    const svg = generatePatternSvg('grid', 800, 600);
    expect(svg).not.toBeNull();
    expect(svg).toContain('<path');
    expect(svg).toContain('stroke="rgba(255,255,255,0.15)"');
    expect(svg).toContain('stroke-width="0.5"');
    expect(svg).toContain('fill="none"');
  });

  it('returns valid SVG with <rect> for stripes pattern', () => {
    const svg = generatePatternSvg('stripes', 800, 600);
    expect(svg).not.toBeNull();
    // stripes uses a rect inside the pattern
    expect(svg).toContain('<rect');
    expect(svg).toContain('fill="rgba(255,255,255,0.15)"');
  });

  it('returns valid SVG with <path> (quadratic bezier) for waves pattern', () => {
    const svg = generatePatternSvg('waves', 800, 600);
    expect(svg).not.toBeNull();
    expect(svg).toContain('<path');
    // Waves use Q command for quadratic bezier curves
    expect(svg).toContain(' Q ');
    expect(svg).toContain('stroke="rgba(255,255,255,0.15)"');
    expect(svg).toContain('fill="none"');
  });

  it('returns valid SVG with <line> for diagonal pattern', () => {
    const svg = generatePatternSvg('diagonal', 800, 600);
    expect(svg).not.toBeNull();
    expect(svg).toContain('<line');
    expect(svg).toContain('stroke="rgba(255,255,255,0.15)"');
    expect(svg).toContain('patternTransform="rotate(45)"');
  });

  it('returns null for unknown pattern type', () => {
    expect(generatePatternSvg('checkerboard', 800, 600)).toBeNull();
    expect(generatePatternSvg('', 800, 600)).toBeNull();
    expect(generatePatternSvg('zigzag', 800, 600)).toBeNull();
  });

  it('uses default color rgba(255,255,255,0.15) when no color specified', () => {
    const svg = generatePatternSvg('dots', 100, 100);
    expect(svg).toContain('rgba(255,255,255,0.15)');
  });

  it('uses default spacing of 30 when no spacing specified', () => {
    const svg = generatePatternSvg('dots', 100, 100);
    // Default spacing=30: pattern width="30" height="30", circle cx="15" cy="15"
    expect(svg).toContain('width="30"');
    expect(svg).toContain('height="30"');
    expect(svg).toContain('cx="15"');
    expect(svg).toContain('cy="15"');
  });

  it('custom color flows through to SVG attributes', () => {
    const customColor = '#ff0000';
    const svg = generatePatternSvg('dots', 100, 100, { color: customColor });
    expect(svg).toContain(`fill="${customColor}"`);
    expect(svg).not.toContain('rgba(255,255,255,0.15)');
  });

  it('custom color works with grid pattern (stroke attribute)', () => {
    const svg = generatePatternSvg('grid', 100, 100, { color: '#00ff00' });
    expect(svg).toContain('stroke="#00ff00"');
  });

  it('custom color works with waves pattern (stroke attribute)', () => {
    const svg = generatePatternSvg('waves', 100, 100, { color: '#0000ff' });
    expect(svg).toContain('stroke="#0000ff"');
  });

  it('custom color works with diagonal pattern (stroke attribute)', () => {
    const svg = generatePatternSvg('diagonal', 100, 100, { color: 'rgba(0,0,0,0.3)' });
    expect(svg).toContain('stroke="rgba(0,0,0,0.3)"');
  });

  it('custom spacing flows through to pattern dimensions', () => {
    const svg = generatePatternSvg('dots', 100, 100, { spacing: 50 });
    // spacing=50: pattern width="50" height="50", circle cx="25" cy="25"
    expect(svg).toContain('width="50"');
    expect(svg).toContain('height="50"');
    expect(svg).toContain('cx="25"');
    expect(svg).toContain('cy="25"');
  });

  it('custom spacing flows through to grid pattern', () => {
    const svg = generatePatternSvg('grid', 100, 100, { spacing: 40 });
    // Pattern dimensions should be 40x40
    expect(svg).toContain('width="40"');
    expect(svg).toContain('height="40"');
    // path: M 40 0 L 0 0 0 40
    expect(svg).toContain('M 40 0 L 0 0 0 40');
  });

  it('custom spacing flows through to stripes pattern', () => {
    const svg = generatePatternSvg('stripes', 100, 100, { spacing: 20 });
    // stripe rect width = spacing/4 = 5
    expect(svg).toContain('width="5"');
  });

  it('waves pattern doubles spacing for horizontal tile', () => {
    const svg = generatePatternSvg('waves', 100, 100, { spacing: 30 });
    // Waves: pattern width = spacing * 2 = 60
    expect(svg).toContain('width="60"');
  });

  it('both custom color and spacing together', () => {
    const svg = generatePatternSvg('dots', 500, 500, { color: '#abcdef', spacing: 75 });
    expect(svg).toContain('fill="#abcdef"');
    expect(svg).toContain('width="75"');
    expect(svg).toContain('height="75"');
  });

  it('all 5 pattern types produce non-null SVG', () => {
    for (const type of PATTERN_TYPES) {
      const svg = generatePatternSvg(type, 100, 100);
      expect(svg, `pattern "${type}" should produce non-null SVG`).not.toBeNull();
      expect(svg, `pattern "${type}" should contain svg tag`).toContain('<svg');
    }
  });

  it('all patterns include patternUnits="userSpaceOnUse"', () => {
    for (const type of PATTERN_TYPES) {
      const svg = generatePatternSvg(type, 100, 100);
      expect(svg, `pattern "${type}" should use userSpaceOnUse`).toContain('patternUnits="userSpaceOnUse"');
    }
  });

  it('all patterns include a full-size rect to fill the canvas', () => {
    for (const type of PATTERN_TYPES) {
      const svg = generatePatternSvg(type, 100, 100);
      expect(svg, `pattern "${type}" should fill canvas`).toContain('fill="url(#p)"');
    }
  });
});
