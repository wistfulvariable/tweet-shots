/**
 * Real-tweet rendering integration tests.
 *
 * These tests exercise the REAL Satori + Resvg rendering pipeline with
 * real tweet data fetched from Twitter's syndication API (cached as fixtures).
 *
 * Only globalThis.fetch is mocked — it returns cached images instead of
 * making network calls. Satori, Resvg, satori-html, and font loading are
 * all real.
 *
 * Fixture types:
 *   - Real tweets: fetched directly from Twitter (text-only, single-photo, etc.)
 *   - Augmented:   real tweet base + hand-crafted additions for features the
 *                  syndication API won't serve (links, quoted tweets, long text)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderTweetToImage } from '../../tweet-render.mjs';
import { THEMES, GRADIENTS } from '../../tweet-html.mjs';
import { loadTweetFixture, createFixtureFetchMock, getFixtureNames } from '../helpers/fixture-loader.mjs';

// ============================================================================
// ASSERTION HELPERS
// ============================================================================

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

function assertValidPng(result) {
  expect(result).toBeDefined();
  expect(result.format).toBe('png');
  expect(result.contentType).toBe('image/png');
  expect(Buffer.isBuffer(result.data)).toBe(true);
  expect(result.data.length).toBeGreaterThan(1000);
  // PNG magic bytes
  expect([...result.data.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  // IHDR chunk (first chunk after 8-byte signature)
  expect(result.data.toString('ascii', 12, 16)).toBe('IHDR');
  // IEND marker present somewhere in the file
  expect(result.data.includes(Buffer.from('IEND'))).toBe(true);
}

function assertValidSvg(result) {
  expect(result).toBeDefined();
  expect(result.format).toBe('svg');
  expect(result.contentType).toBe('image/svg+xml');
  const svg = result.data.toString('utf-8');
  expect(svg).toMatch(/^<svg/);
  expect(svg).toContain('</svg>');
  expect(svg.length).toBeGreaterThan(500);
  expect(svg).toMatch(/width="\d+"/);
  expect(svg).toMatch(/height="\d+"/);
}

// ============================================================================
// TEST SETUP
// ============================================================================

let originalFetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ============================================================================
// CONTENT TYPE TESTS — one per fixture
// ============================================================================

describe('Real tweet rendering', { timeout: 30_000 }, () => {

  describe('Content types — PNG', () => {
    it('renders text-only tweet (@jack first tweet)', async () => {
      globalThis.fetch = createFixtureFetchMock('text-only');
      const tweet = loadTweetFixture('text-only');
      const result = await renderTweetToImage(tweet, { theme: 'dark', format: 'png' });
      assertValidPng(result);
    });

    it('renders single-photo tweet (@BarackObama)', async () => {
      globalThis.fetch = createFixtureFetchMock('single-photo');
      const tweet = loadTweetFixture('single-photo');
      const result = await renderTweetToImage(tweet, { theme: 'dark', format: 'png' });
      assertValidPng(result);
    });

    it('renders multi-photo tweet with 4 images (@FLOTUS44)', async () => {
      globalThis.fetch = createFixtureFetchMock('multi-photo');
      const tweet = loadTweetFixture('multi-photo');
      const result = await renderTweetToImage(tweet, { theme: 'dark', format: 'png' });
      assertValidPng(result);
    });

    it('renders tweet with hashtags (@TheEllenShow #oscars)', async () => {
      globalThis.fetch = createFixtureFetchMock('with-hashtags');
      const tweet = loadTweetFixture('with-hashtags');
      const result = await renderTweetToImage(tweet, { theme: 'dark', format: 'png' });
      assertValidPng(result);
    });

    it('renders tweet with @mentions (@elonmusk reply)', async () => {
      globalThis.fetch = createFixtureFetchMock('with-mentions');
      const tweet = loadTweetFixture('with-mentions');
      const result = await renderTweetToImage(tweet, { theme: 'dark', format: 'png' });
      assertValidPng(result);
    });

    it('renders tweet with photo and newlines (@elonmusk)', async () => {
      globalThis.fetch = createFixtureFetchMock('photo-newlines');
      const tweet = loadTweetFixture('photo-newlines');
      const result = await renderTweetToImage(tweet, { theme: 'dark', format: 'png' });
      assertValidPng(result);
    });

    it('renders video thumbnail tweet (@elonmusk sink)', async () => {
      globalThis.fetch = createFixtureFetchMock('video-tweet');
      const tweet = loadTweetFixture('video-tweet');
      const result = await renderTweetToImage(tweet, { theme: 'dark', format: 'png' });
      assertValidPng(result);
    });

    it('renders verified user tweet (@karpathy)', async () => {
      globalThis.fetch = createFixtureFetchMock('verified-user');
      const tweet = loadTweetFixture('verified-user');
      const result = await renderTweetToImage(tweet, { theme: 'dark', format: 'png' });
      assertValidPng(result);
    });

    it('renders unverified user tweet (@edent)', async () => {
      globalThis.fetch = createFixtureFetchMock('unverified-user');
      const tweet = loadTweetFixture('unverified-user');
      const result = await renderTweetToImage(tweet, { theme: 'dark', format: 'png' });
      assertValidPng(result);
    });

    it('renders tweet with URL links (augmented)', async () => {
      globalThis.fetch = createFixtureFetchMock('with-links');
      const tweet = loadTweetFixture('with-links');
      const result = await renderTweetToImage(tweet, { theme: 'dark', format: 'png' });
      assertValidPng(result);
    });

    it('renders quoted tweet - text only (augmented)', async () => {
      globalThis.fetch = createFixtureFetchMock('quoted-text');
      const tweet = loadTweetFixture('quoted-text');
      const result = await renderTweetToImage(tweet, { theme: 'dark', format: 'png' });
      assertValidPng(result);
    });

    it('renders quoted tweet with media (augmented)', async () => {
      globalThis.fetch = createFixtureFetchMock('quoted-media');
      const tweet = loadTweetFixture('quoted-media');
      const result = await renderTweetToImage(tweet, { theme: 'dark', format: 'png' });
      assertValidPng(result);
    });

    it('renders long text tweet with newlines (augmented)', async () => {
      globalThis.fetch = createFixtureFetchMock('long-text');
      const tweet = loadTweetFixture('long-text');
      const result = await renderTweetToImage(tweet, { theme: 'dark', format: 'png' });
      assertValidPng(result);
    });
  });

  // ============================================================================
  // SVG FORMAT
  // ============================================================================

  describe('SVG format', () => {
    it('renders text-only tweet as SVG', async () => {
      globalThis.fetch = createFixtureFetchMock('text-only');
      const tweet = loadTweetFixture('text-only');
      const result = await renderTweetToImage(tweet, { theme: 'dark', format: 'svg' });
      assertValidSvg(result);
    });

    it('renders photo tweet as SVG', async () => {
      globalThis.fetch = createFixtureFetchMock('single-photo');
      const tweet = loadTweetFixture('single-photo');
      const result = await renderTweetToImage(tweet, { theme: 'dark', format: 'svg' });
      assertValidSvg(result);
    });
  });

  // ============================================================================
  // SCALE
  // ============================================================================

  describe('Scale', () => {
    it('renders at 2x scale (larger PNG)', async () => {
      globalThis.fetch = createFixtureFetchMock('text-only');
      const tweet1x = loadTweetFixture('text-only');
      const tweet2x = loadTweetFixture('text-only');

      globalThis.fetch = createFixtureFetchMock('text-only');
      const result1x = await renderTweetToImage(tweet1x, { format: 'png', scale: 1 });

      globalThis.fetch = createFixtureFetchMock('text-only');
      const result2x = await renderTweetToImage(tweet2x, { format: 'png', scale: 2 });

      assertValidPng(result1x);
      assertValidPng(result2x);
      // 2x should produce a larger image
      expect(result2x.data.length).toBeGreaterThan(result1x.data.length);
    });
  });

  // ============================================================================
  // THEMES
  // ============================================================================

  describe('Themes', () => {
    const themeNames = Object.keys(THEMES);

    it.each(themeNames)('renders with %s theme', async (theme) => {
      globalThis.fetch = createFixtureFetchMock('verified-user');
      const tweet = loadTweetFixture('verified-user');
      const result = await renderTweetToImage(tweet, { theme, format: 'png' });
      assertValidPng(result);
    });
  });

  // ============================================================================
  // GRADIENTS
  // ============================================================================

  describe('Gradients', () => {
    const gradientNames = Object.keys(GRADIENTS);

    it.each(gradientNames)('renders with %s gradient', async (gradient) => {
      globalThis.fetch = createFixtureFetchMock('verified-user');
      const tweet = loadTweetFixture('verified-user');
      const result = await renderTweetToImage(tweet, {
        theme: 'dark',
        backgroundGradient: gradient,
        format: 'png',
      });
      assertValidPng(result);
    });
  });

  // ============================================================================
  // RENDERING OPTIONS
  // ============================================================================

  describe('Rendering options', () => {
    it('renders with hideMedia=true (photo tweet)', async () => {
      globalThis.fetch = createFixtureFetchMock('single-photo');
      const tweet = loadTweetFixture('single-photo');
      const result = await renderTweetToImage(tweet, { theme: 'dark', hideMedia: true, format: 'png' });
      assertValidPng(result);
    });

    it('renders with hideDate=true', async () => {
      globalThis.fetch = createFixtureFetchMock('verified-user');
      const tweet = loadTweetFixture('verified-user');
      const result = await renderTweetToImage(tweet, { theme: 'dark', hideDate: true, format: 'png' });
      assertValidPng(result);
    });

    it('renders with hideVerified=true (verified user)', async () => {
      globalThis.fetch = createFixtureFetchMock('verified-user');
      const tweet = loadTweetFixture('verified-user');
      const result = await renderTweetToImage(tweet, { theme: 'dark', hideVerified: true, format: 'png' });
      assertValidPng(result);
    });

    it('renders with showMetrics=false', async () => {
      globalThis.fetch = createFixtureFetchMock('verified-user');
      const tweet = loadTweetFixture('verified-user');
      const result = await renderTweetToImage(tweet, { theme: 'dark', showMetrics: false, format: 'png' });
      assertValidPng(result);
    });

    it('renders with hideQuoteTweet=true (quoted tweet)', async () => {
      globalThis.fetch = createFixtureFetchMock('quoted-text');
      const tweet = loadTweetFixture('quoted-text');
      const result = await renderTweetToImage(tweet, { theme: 'dark', hideQuoteTweet: true, format: 'png' });
      assertValidPng(result);
    });

    it('renders with custom backgroundColor', async () => {
      globalThis.fetch = createFixtureFetchMock('verified-user');
      const tweet = loadTweetFixture('verified-user');
      const result = await renderTweetToImage(tweet, {
        theme: 'dark',
        backgroundColor: '#1a1a2e',
        format: 'png',
      });
      assertValidPng(result);
    });

    it('renders with custom width 1080px', async () => {
      globalThis.fetch = createFixtureFetchMock('verified-user');
      const tweet = loadTweetFixture('verified-user');
      const result = await renderTweetToImage(tweet, { theme: 'dark', width: 1080, format: 'png' });
      assertValidPng(result);
    });

    it('renders with custom padding and borderRadius', async () => {
      globalThis.fetch = createFixtureFetchMock('verified-user');
      const tweet = loadTweetFixture('verified-user');
      const result = await renderTweetToImage(tweet, {
        theme: 'dark',
        padding: 40,
        borderRadius: 24,
        format: 'png',
      });
      assertValidPng(result);
    });

    it('renders with hideShadow=true', async () => {
      globalThis.fetch = createFixtureFetchMock('verified-user');
      const tweet = loadTweetFixture('verified-user');
      const result = await renderTweetToImage(tweet, { theme: 'light', hideShadow: true, format: 'png' });
      assertValidPng(result);
    });

    it('renders with custom textColor and linkColor', async () => {
      globalThis.fetch = createFixtureFetchMock('with-links');
      const tweet = loadTweetFixture('with-links');
      const result = await renderTweetToImage(tweet, {
        theme: 'dark',
        textColor: '#e0e0e0',
        linkColor: '#ff6b6b',
        format: 'png',
      });
      assertValidPng(result);
    });
  });
});
