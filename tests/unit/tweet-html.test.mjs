/**
 * Unit tests for tweet-html.mjs — HTML template generation.
 * Tests new features: multi-image grid, logo placement, custom gradient,
 * phone frame, and thread HTML generation.
 */

import { describe, it, expect } from 'vitest';
import {
  generateTweetHtml,
  generateThreadHtml,
  GRADIENTS,
  PHONE_CHROME,
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
    // The connector is a 2px wide div with flex:1
    expect(html).not.toContain('flex: 1');
    expect(html).toContain('First tweet in thread');
  });
});
