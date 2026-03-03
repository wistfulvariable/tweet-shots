/**
 * Rendering pipeline — Satori (HTML→SVG) and Resvg (SVG→PNG) conversion.
 * Pre-fetches remote images to base64 data URIs before rendering.
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { html } from 'satori-html';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateTweetHtml, addLogoToHtml, getHighResProfileUrl } from './tweet-html.mjs';

// ============================================================================
// CONFIGURATION
// ============================================================================

// Dimension presets for social media
export const DIMENSIONS = {
  auto: { width: 550, height: null },
  instagramFeed: { width: 1080, height: 1080 },
  instagramStory: { width: 1080, height: 1920 },
  instagramVertical: { width: 1080, height: 1350 },
  tiktok: { width: 1080, height: 1920 },
  linkedin: { width: 1200, height: 627 },
  twitter: { width: 1200, height: 675 },
  facebook: { width: 1200, height: 630 },
  youtube: { width: 1280, height: 720 },
};

// ============================================================================
// IMAGE UTILITIES
// ============================================================================

/**
 * Append a Twitter CDN size variant to an image URL.
 * Twitter pbs.twimg.com supports: small (680px), medium (1200px), large (2048px).
 * Non-Twitter URLs are returned unchanged.
 * @param {string} url - Image URL
 * @param {'small'|'medium'|'large'} size - Desired size variant
 * @returns {string} URL with size suffix
 */
function twitterImageUrl(url, size) {
  if (!url || !size || !url.includes('pbs.twimg.com/media/')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}name=${size}`;
}

/**
 * Choose optimal Twitter CDN size based on render width and scale.
 * Capped at 'medium' (1200px) — 'large' (2048px) is unnecessary for our
 * max render widths and causes timeouts on multi-image tweets.
 * @param {number} width - Render width in pixels
 * @param {number} scale - Render scale multiplier
 * @returns {'small'|'medium'}
 */
function pickImageSize(width, scale) {
  const effective = width * scale;
  if (effective <= 680) return 'small';
  return 'medium';
}

const IMAGE_FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch a remote image and convert it to a base64 data URI.
 * Returns null on any failure (non-OK response, network error, timeout).
 * Each image fetch is individually capped at IMAGE_FETCH_TIMEOUT_MS to
 * prevent a single slow image from exhausting the render budget.
 * @param {string} url - Image URL to fetch
 * @returns {Promise<string|null>} Base64 data URI or null on failure
 */
export async function fetchImageAsBase64(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      console.error(`Image pre-fetch failed: HTTP ${response.status} for ${url.substring(0, 80)}`);
      return null;
    }
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return `data:${contentType};base64,${base64}`;
  } catch (e) {
    const reason = e.name === 'AbortError' ? 'timed out' : e.message;
    console.error(`Image pre-fetch error for ${url.substring(0, 80)}: ${reason}`);
    return null;
  }
}

/**
 * Pre-fetch all remote images in a tweet (profile, media, quote tweet) in parallel.
 * Replaces URLs with base64 data URIs in-place.
 * @param {object} tweet - Tweet data object (mutated in-place)
 * @param {object} [options]
 * @param {'small'|'medium'|'large'} [options.imageSize] - Twitter CDN size variant
 */
async function preFetchAllImages(tweet, { imageSize } = {}) {
  const jobs = [];

  // Profile image
  if (tweet.user?.profile_image_url_https) {
    jobs.push(
      fetchImageAsBase64(getHighResProfileUrl(tweet.user))
        .then(b64 => { if (b64) tweet.user.profile_image_url_https = b64; })
    );
  }

  // Media images (mediaDetails + photos)
  if (tweet.mediaDetails) {
    for (const media of tweet.mediaDetails) {
      if (media.media_url_https) {
        const url = twitterImageUrl(media.media_url_https, imageSize);
        jobs.push(
          fetchImageAsBase64(url)
            .then(b64 => { if (b64) media.media_url_https = b64; })
        );
      }
    }
  }
  if (tweet.photos) {
    for (const photo of tweet.photos) {
      if (photo.url) {
        const url = twitterImageUrl(photo.url, imageSize);
        jobs.push(
          fetchImageAsBase64(url)
            .then(b64 => { if (b64) photo.url = b64; })
        );
      }
    }
  }

  // Quote tweet images (profile + first media only)
  if (tweet.quoted_tweet) {
    const qt = tweet.quoted_tweet;
    if (qt.user?.profile_image_url_https) {
      jobs.push(
        fetchImageAsBase64(getHighResProfileUrl(qt.user))
          .then(b64 => { if (b64) qt.user.profile_image_url_https = b64; })
      );
    }
    if (qt.mediaDetails?.[0]?.media_url_https) {
      const url = twitterImageUrl(qt.mediaDetails[0].media_url_https, imageSize);
      jobs.push(
        fetchImageAsBase64(url)
          .then(b64 => { if (b64) qt.mediaDetails[0].media_url_https = b64; })
      );
    }
    if (qt.photos?.[0]?.url) {
      const url = twitterImageUrl(qt.photos[0].url, imageSize);
      jobs.push(
        fetchImageAsBase64(url)
          .then(b64 => { if (b64) qt.photos[0].url = b64; })
      );
    }
  }

  await Promise.all(jobs);
}

/**
 * Count the total number of media images in a tweet (including quote tweet).
 * Used by the render pool to set dynamic timeouts for media-heavy tweets.
 * @param {object} tweet - Tweet data object
 * @returns {number}
 */
export function countMediaImages(tweet) {
  let count = 0;
  if (tweet?.mediaDetails) count += tweet.mediaDetails.length;
  else if (tweet?.photos) count += tweet.photos.length;
  if (tweet?.quoted_tweet?.mediaDetails) count += tweet.quoted_tweet.mediaDetails.length;
  else if (tweet?.quoted_tweet?.photos) count += tweet.quoted_tweet.photos.length;
  return count;
}

// ============================================================================
// FONT LOADING
// ============================================================================

// Module-level font cache — loaded once per process
let _cachedFonts = null;

/**
 * Load Inter fonts from bundled WOFF files, falling back to network fetch.
 * Cached after first call — subsequent calls return the same array.
 * @returns {Promise<Array<{name: string, data: ArrayBuffer, weight: number, style: string}>>}
 * @throws {Error} If no fonts could be loaded from any source
 */
export async function loadFonts() {
  if (_cachedFonts) return _cachedFonts;

  const fonts = [];

  // Try bundled fonts first (eliminates network fetch on cold starts)
  const __coreDir = path.dirname(fileURLToPath(import.meta.url));
  const fontsDir = path.join(__coreDir, 'fonts');
  const localFonts = [
    { file: 'Inter-Regular.woff', weight: 400 },
    { file: 'Inter-Bold.woff', weight: 700 },
  ];

  for (const { file, weight } of localFonts) {
    const filePath = path.join(fontsDir, file);
    try {
      if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath);
        // Create a properly-sized ArrayBuffer copy (Node Buffer.buffer may be a shared pool)
        const ab = new ArrayBuffer(buf.byteLength);
        new Uint8Array(ab).set(buf);
        fonts.push({ name: 'Inter', data: ab, weight, style: 'normal' });
      }
    } catch (e) {
      console.error(`Font loading: failed to read bundled font file=${file}: ${e.message}`);
    }
  }

  // Fall back to network fetch if bundled fonts not found
  if (fonts.length === 0) {
    try {
      const regularUrl = 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf';
      const regularResponse = await fetch(regularUrl);
      if (regularResponse.ok) {
        fonts.push({ name: 'Inter', data: await regularResponse.arrayBuffer(), weight: 400, style: 'normal' });
      }

      const boldUrl = 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZg.ttf';
      const boldResponse = await fetch(boldUrl);
      if (boldResponse.ok) {
        fonts.push({ name: 'Inter', data: await boldResponse.arrayBuffer(), weight: 700, style: 'normal' });
      }
    } catch (e) {
      console.error(`Font loading: network font fetch failed (bundled fonts missing): ${e.message}`);
    }
  }

  if (fonts.length === 0) {
    throw new Error('No fonts available: bundled fonts missing from fonts/ directory and network fallback failed. Check deployment includes fonts/Inter-Regular.woff and fonts/Inter-Bold.woff.');
  }

  _cachedFonts = fonts;
  return fonts;
}

// ============================================================================
// HEIGHT ESTIMATION
// ============================================================================

// Approximate pixel heights for each tweet section (used for Satori canvas sizing)
const HEIGHT_HEADER = 140;       // Profile pic + name + X logo
const HEIGHT_PER_TEXT_LINE = 28; // ~28px per line of body text
const CHARS_PER_LINE = 45;       // ~45 characters per line at 17px font in 550px width
const HEIGHT_MEDIA = 320;        // Single media image
const HEIGHT_QUOTE_TWEET = 120;  // Quote tweet embed card
const HEIGHT_METRICS = 60;       // Engagement metrics bar
const HEIGHT_DATE = 40;          // Timestamp line

/**
 * Estimate canvas height based on tweet content and visibility options.
 * Satori requires explicit dimensions — this avoids clipping or excess whitespace.
 */
function calculateHeight(tweet, { padding, hideMedia, hideQuoteTweet, showMetrics, hideDate }) {
  const textLength = tweet.text?.length || 0;
  const hasMedia = !hideMedia && ((tweet.photos?.length > 0) || (tweet.mediaDetails?.length > 0));
  const hasQuoteTweet = !hideQuoteTweet && !!tweet.quoted_tweet;

  return (
    HEIGHT_HEADER + (padding * 2) +
    Math.ceil(textLength / CHARS_PER_LINE) * HEIGHT_PER_TEXT_LINE +
    (hasMedia ? HEIGHT_MEDIA : 0) +
    (hasQuoteTweet ? HEIGHT_QUOTE_TWEET : 0) +
    (showMetrics ? HEIGHT_METRICS : 0) +
    (hideDate ? 0 : HEIGHT_DATE)
  );
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Render a tweet to a PNG or SVG image.
 * Pre-fetches all remote images to base64, generates HTML, runs through Satori+Resvg.
 * Note: mutates tweet object in-place by replacing image URLs with base64 data URIs.
 * @param {object} tweet - Tweet data from fetchTweet()
 * @param {object} [options] - Render options (theme, format, scale, etc.)
 * @returns {Promise<{data: Buffer, format: string, contentType: string}>}
 */
export async function renderTweetToImage(tweet, options = {}) {
  const {
    theme = 'dark',
    width = 550,
    showMetrics = true,
    format = 'png',
    scale = 1,
    hideMedia = false,
    hideVerified = false,
    hideDate = false,
    hideQuoteTweet = false,
    hideShadow = false,
    backgroundColor = null,
    backgroundGradient = null,
    backgroundImage = null,
    textColor = null,
    linkColor = null,
    padding = 20,
    borderRadius = 16,
    logo = null,
    logoPosition = 'bottom-right',
    logoSize = 40,
  } = options;

  // Pre-fetch all remote images in parallel, using optimally-sized Twitter CDN variants
  const imageSize = pickImageSize(width, scale);
  await preFetchAllImages(tweet, { imageSize });

  // Pre-fetch logo if provided
  let logoBase64 = null;
  if (logo) {
    logoBase64 = await fetchImageAsBase64(logo);
  }

  let htmlContent = generateTweetHtml(tweet, theme, {
    showMetrics,
    width,
    padding,
    hideMedia,
    hideVerified,
    hideDate,
    hideQuoteTweet,
    hideShadow,
    backgroundColor,
    backgroundGradient,
    backgroundImage,
    textColor,
    linkColor,
    borderRadius,
  });

  // Add logo if provided
  if (logoBase64) {
    htmlContent = addLogoToHtml(htmlContent, logoBase64, logoPosition, logoSize);
  }

  const markup = html(htmlContent);

  // Load fonts (cached after first call)
  const fonts = await loadFonts();

  const calculatedHeight = calculateHeight(tweet, { padding, hideMedia, hideQuoteTweet, showMetrics, hideDate });

  // Apply scale
  const scaledWidth = (width + padding * 2) * scale;

  // Generate SVG with Satori
  const svg = await satori(markup, {
    width: width + padding * 2,
    height: calculatedHeight,
    fonts,
    // Prevent Satori from trying to fetch fallback fonts/emojis from the network
    loadAdditionalAsset: async () => undefined,
  });

  if (format === 'svg') {
    return { data: Buffer.from(svg), format: 'svg', contentType: 'image/svg+xml' };
  }

  // Convert to PNG with Resvg
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: scaledWidth,
    },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return { data: pngBuffer, format: 'png', contentType: 'image/png' };
}
