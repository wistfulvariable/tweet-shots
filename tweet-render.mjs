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
import { generateTweetHtml, addLogoToHtml, getHighResProfileUrl, GRADIENT_FRAME_PADDING } from './tweet-html.mjs';
import { fetchEmoji } from './tweet-emoji.mjs';
import { loadLanguageFont } from './tweet-fonts.mjs';

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
 * Returns a Map of htmlUrl → base64 data URI. Does NOT mutate the tweet object —
 * images are injected into the Satori VDOM after HTML parsing to avoid satori-html's
 * O(n²) parsing cost on large base64 strings.
 * @param {object} tweet - Tweet data object (not mutated)
 * @param {object} [options]
 * @param {'small'|'medium'|'large'} [options.imageSize] - Twitter CDN size variant
 * @returns {Promise<Map<string, string>>} Map of URL-as-it-appears-in-HTML → base64
 */
async function preFetchAllImages(tweet, { imageSize } = {}) {
  const imageMap = new Map();
  const jobs = [];

  // Profile image — HTML uses getHighResProfileUrl() which replaces _normal with _400x400
  if (tweet.user?.profile_image_url_https) {
    const htmlUrl = getHighResProfileUrl(tweet.user);
    jobs.push(
      fetchImageAsBase64(htmlUrl)
        .then(b64 => { if (b64) imageMap.set(htmlUrl, b64); })
    );
  }

  // Media images — HTML uses the raw media_url_https / photo.url;
  // we fetch an optimally-sized variant but key by the URL that appears in HTML
  if (tweet.mediaDetails) {
    for (const media of tweet.mediaDetails) {
      if (media.media_url_https) {
        const htmlUrl = media.media_url_https;
        const fetchUrl = twitterImageUrl(htmlUrl, imageSize);
        jobs.push(
          fetchImageAsBase64(fetchUrl)
            .then(b64 => { if (b64) imageMap.set(htmlUrl, b64); })
        );
      }
    }
  }
  if (tweet.photos) {
    for (const photo of tweet.photos) {
      if (photo.url) {
        const htmlUrl = photo.url;
        const fetchUrl = twitterImageUrl(htmlUrl, imageSize);
        jobs.push(
          fetchImageAsBase64(fetchUrl)
            .then(b64 => { if (b64) imageMap.set(htmlUrl, b64); })
        );
      }
    }
  }

  // Quote tweet images (profile + first media only)
  if (tweet.quoted_tweet) {
    const qt = tweet.quoted_tweet;
    if (qt.user?.profile_image_url_https) {
      const htmlUrl = getHighResProfileUrl(qt.user);
      jobs.push(
        fetchImageAsBase64(htmlUrl)
          .then(b64 => { if (b64) imageMap.set(htmlUrl, b64); })
      );
    }
    if (qt.mediaDetails?.[0]?.media_url_https) {
      const htmlUrl = qt.mediaDetails[0].media_url_https;
      const fetchUrl = twitterImageUrl(htmlUrl, imageSize);
      jobs.push(
        fetchImageAsBase64(fetchUrl)
          .then(b64 => { if (b64) imageMap.set(htmlUrl, b64); })
      );
    }
    if (qt.photos?.[0]?.url) {
      const htmlUrl = qt.photos[0].url;
      const fetchUrl = twitterImageUrl(htmlUrl, imageSize);
      jobs.push(
        fetchImageAsBase64(fetchUrl)
          .then(b64 => { if (b64) imageMap.set(htmlUrl, b64); })
      );
    }
  }

  await Promise.all(jobs);
  return imageMap;
}

/**
 * Walk the satori-html VDOM tree and replace image src URLs with base64 data URIs.
 * This avoids embedding large base64 strings in the HTML that satori-html must parse,
 * which causes O(n²) parsing time on strings >100KB.
 * @param {object} node - VDOM node from satori-html
 * @param {Map<string, string>} imageMap - URL → base64 map from preFetchAllImages
 */
function injectImageSources(node, imageMap) {
  if (!node || typeof node !== 'object') return;
  if (node.props?.src && imageMap.has(node.props.src)) {
    node.props.src = imageMap.get(node.props.src);
  }
  if (Array.isArray(node.props?.children)) {
    for (const child of node.props.children) {
      injectImageSources(child, imageMap);
    }
  }
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

// Approximate pixel heights for each tweet section (used for Satori canvas sizing).
// Tuned to match actual Satori flexbox layout with small safety buffers.
const HEIGHT_HEADER = 76;        // Profile pic (48) + margin-top to text (12) + buffer (16)
const HEIGHT_PER_TEXT_LINE = 28; // ~28px per line (17px font * 1.5 line-height + spacing)
const CHARS_PER_LINE = 45;       // ~45 characters per line at 17px font in 550px width
const HEIGHT_MEDIA = 300;        // Media image (280) + margin-top (12) + buffer (8)
const HEIGHT_QUOTE_TWEET = 120;  // Quote tweet embed card (complex layout, keep generous)
const HEIGHT_METRICS = 56;       // Metrics bar: margin (16) + padding-top (16) + content (20) + buffer (4)
const HEIGHT_DATE = 40;          // Timestamp: margin (16) + text (20) + buffer (4)
const HEIGHT_URL = 36;           // Tweet URL: margin (12) + text (14) + buffer (10)

/**
 * Estimate canvas height based on tweet content and visibility options.
 * Satori requires explicit dimensions — this avoids clipping or excess whitespace.
 */
function calculateHeight(tweet, { padding, hideMedia, hideQuoteTweet, showMetrics, hideDate, showUrl }) {
  const textLength = tweet.text?.length || 0;
  const hasMedia = !hideMedia && ((tweet.photos?.length > 0) || (tweet.mediaDetails?.length > 0));
  const hasQuoteTweet = !hideQuoteTweet && !!tweet.quoted_tweet;

  return (
    HEIGHT_HEADER + (padding * 2) +
    Math.ceil(textLength / CHARS_PER_LINE) * HEIGHT_PER_TEXT_LINE +
    (hasMedia ? HEIGHT_MEDIA : 0) +
    (hasQuoteTweet ? HEIGHT_QUOTE_TWEET : 0) +
    (showMetrics ? HEIGHT_METRICS : 0) +
    (hideDate ? 0 : HEIGHT_DATE) +
    (showUrl ? HEIGHT_URL : 0)
  );
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Render a tweet to a PNG or SVG image.
 * Pre-fetches all remote images to base64, generates HTML with short URLs,
 * parses through satori-html, then injects base64 into the VDOM tree.
 * Does not mutate the tweet object.
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
    scale = 2,
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
    showUrl = false,
    tweetId = null,
    // Canvas dimensions from dimension presets (e.g. instagramFeed 1080x1080)
    canvasWidth: canvasWidthOverride = null,
    canvasHeight: canvasHeightOverride = null,
  } = options;

  // Pre-fetch all remote images in parallel, using optimally-sized Twitter CDN variants.
  // Returns a Map of htmlUrl → base64 (tweet object is NOT mutated).
  const imageSize = pickImageSize(width, scale);
  const imageMap = await preFetchAllImages(tweet, { imageSize });

  // Pre-fetch logo — add to imageMap so the VDOM walker injects it
  if (logo) {
    const logoBase64 = await fetchImageAsBase64(logo);
    if (logoBase64) imageMap.set(logo, logoBase64);
  }

  // Determine canvas dimensions based on gradient/dimension requirements
  const hasGradient = !!(backgroundGradient || backgroundImage);
  const hasFixedDimensions = !!(canvasWidthOverride && canvasHeightOverride);
  const gradientPad = hasGradient ? GRADIENT_FRAME_PADDING : 0;

  const contentHeight = calculateHeight(tweet, { padding, hideMedia, hideQuoteTweet, showMetrics, hideDate, showUrl });

  let canvasWidth, canvasHeight;
  if (hasFixedDimensions) {
    // Dimension preset: use preset dimensions, ensure content fits
    canvasWidth = canvasWidthOverride;
    canvasHeight = Math.max(canvasHeightOverride, contentHeight + gradientPad * 2);
  } else if (hasGradient) {
    // Gradient frame: add padding around the card
    canvasWidth = width + padding * 2 + gradientPad * 2;
    canvasHeight = contentHeight + gradientPad * 2;
  } else {
    // Standard: canvas = card dimensions
    canvasWidth = width + padding * 2;
    canvasHeight = contentHeight;
  }

  const needsWrapper = hasGradient || hasFixedDimensions;

  let htmlContent = generateTweetHtml(tweet, theme, {
    showMetrics,
    width,
    padding,
    hideMedia,
    hideVerified,
    hideDate,
    hideQuoteTweet,
    hideShadow,
    showUrl,
    tweetId,
    backgroundColor,
    backgroundGradient,
    backgroundImage,
    textColor,
    linkColor,
    borderRadius,
    canvasWidth: needsWrapper ? canvasWidth : null,
    canvasHeight: needsWrapper ? canvasHeight : null,
  });

  // Add logo if provided (uses original URL — base64 injected via VDOM walker)
  if (logo) {
    htmlContent = addLogoToHtml(htmlContent, logo, logoPosition, logoSize);
  }

  // Parse HTML → VDOM (fast: no base64 in the string, just short URLs)
  const markup = html(htmlContent);

  // Inject base64 images into the VDOM tree (bypasses satori-html's O(n²) parser)
  injectImageSources(markup, imageMap);

  // Load fonts (cached after first call)
  const fonts = await loadFonts();

  // Apply scale
  const scaledWidth = canvasWidth * scale;

  // Generate SVG with Satori
  const svg = await satori(markup, {
    width: canvasWidth,
    height: canvasHeight,
    fonts,
    // Load emoji SVGs from Twemoji CDN and multilingual fonts from bundled Noto Sans
    loadAdditionalAsset: async (code, segment) => {
      if (code === 'emoji') return fetchEmoji(segment);
      return loadLanguageFont(code);
    },
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
