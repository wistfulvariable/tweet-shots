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
import { createLogger } from './src/logger.mjs';

const logger = createLogger();
import {
  generateTweetHtml,
  generateThreadHtml,
  getHighResProfileUrl,
  GRADIENT_FRAME_PADDING,
  PHONE_CHROME,
} from './tweet-html.mjs';
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
const FONT_FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch a remote font file and return its data as an ArrayBuffer.
 * Returns null on any failure (non-OK response, network error, timeout).
 * @param {string} url - Font file URL (.ttf, .woff, .otf)
 * @returns {Promise<ArrayBuffer|null>}
 */
export async function fetchFontAsArrayBuffer(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FONT_FETCH_TIMEOUT_MS);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      logger.error({ status: response.status, url: url.substring(0, 80) }, 'Font fetch failed');
      return null;
    }
    const buffer = await response.arrayBuffer();
    return buffer;
  } catch (e) {
    const reason = e.name === 'AbortError' ? 'timed out' : e.message;
    logger.error({ url: url.substring(0, 80), reason }, 'Font fetch error');
    return null;
  }
}

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
      logger.error({ status: response.status, url: url.substring(0, 80) }, 'Image pre-fetch failed');
      return null;
    }
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return `data:${contentType};base64,${base64}`;
  } catch (e) {
    const reason = e.name === 'AbortError' ? 'timed out' : e.message;
    logger.error({ url: url.substring(0, 80), reason }, 'Image pre-fetch error');
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
      logger.error({ file, err: e.message }, 'Bundled font read failed');
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
      logger.error({ err: e.message }, 'Network font fetch failed');
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
const HEIGHT_MEDIA_1 = 300;      // 1 image: 280px + margin + buffer
const HEIGHT_MEDIA_2_3 = 252;    // 2–3 images: 220px + margin + buffer
const HEIGHT_MEDIA_4 = 354;      // 4 images: 2×160px + 2px gap + margin + buffer
const HEIGHT_QUOTE_TWEET = 120;  // Quote tweet embed card (complex layout, keep generous)
const HEIGHT_METRICS = 56;       // Metrics bar: margin (16) + padding-top (16) + content (20) + buffer (4)
const HEIGHT_DATE = 40;          // Timestamp: margin (16) + text (20) + buffer (4)
const HEIGHT_URL = 36;           // Tweet URL: margin (12) + text (14) + buffer (10)

/** Return estimated media block height based on image count. */
function mediaHeight(count) {
  if (count === 0) return 0;
  if (count === 1) return HEIGHT_MEDIA_1;
  if (count <= 3) return HEIGHT_MEDIA_2_3;
  return HEIGHT_MEDIA_4;
}

/**
 * Estimate canvas height based on tweet content and visibility options.
 * Satori requires explicit dimensions — this avoids clipping or excess whitespace.
 */
function calculateHeight(tweet, { padding, hideMedia, hideQuoteTweet, showMetrics, hideDate, showUrl }) {
  const textLength = tweet.text?.length || 0;
  const mediaCount = hideMedia ? 0 : (tweet.mediaDetails?.length || tweet.photos?.length || 0);
  const hasQuoteTweet = !hideQuoteTweet && !!tweet.quoted_tweet;

  return (
    HEIGHT_HEADER + (padding * 2) +
    Math.ceil(textLength / CHARS_PER_LINE) * HEIGHT_PER_TEXT_LINE +
    mediaHeight(mediaCount) +
    (hasQuoteTweet ? HEIGHT_QUOTE_TWEET : 0) +
    (showMetrics ? HEIGHT_METRICS : 0) +
    (hideDate ? 0 : HEIGHT_DATE) +
    (showUrl ? HEIGHT_URL : 0)
  );
}

// Height constants for thread tweet items (more compact than single-tweet layout)
const THREAD_HEADER_HEIGHT = 56;   // Name/handle/time in single compact row
const THREAD_TEXT_LINE_HEIGHT = 26;
const THREAD_CHARS_PER_LINE = 42;  // Narrower content column (excludes avatar col)
const THREAD_METRICS_HEIGHT = 42;  // Simplified 2-metric bar
const THREAD_CONNECTOR_HEIGHT = 16; // Connector line between tweets

/** Estimate height for a single tweet within a thread layout. */
function calculateThreadTweetHeight(tweet, { hideMedia, showMetrics }) {
  const textLength = tweet.text?.length || 0;
  const mediaCount = hideMedia ? 0 : (tweet.mediaDetails?.length || tweet.photos?.length || 0);
  return (
    THREAD_HEADER_HEIGHT +
    Math.ceil(textLength / THREAD_CHARS_PER_LINE) * THREAD_TEXT_LINE_HEIGHT +
    mediaHeight(mediaCount) +
    (showMetrics ? THREAD_METRICS_HEIGHT : 0)
  );
}

/** Estimate total canvas height for a thread of tweets. */
function calculateThreadHeight(tweets, options) {
  const { padding, hideMedia, showMetrics } = options;
  let total = padding * 2;
  tweets.forEach((tweet, i) => {
    total += calculateThreadTweetHeight(tweet, { hideMedia, showMetrics });
    if (i < tweets.length - 1) total += THREAD_CONNECTOR_HEIGHT;
  });
  return total;
}

// ============================================================================
// SHARED SATORI RENDERING
// ============================================================================

/** Load fonts: custom URL-based or cached Inter. */
async function resolveFonts(fontUrl, fontBoldUrl, fontFamily) {
  if (fontUrl) {
    const customName = fontFamily || 'CustomFont';
    const [regularData, boldData] = await Promise.all([
      fetchFontAsArrayBuffer(fontUrl),
      fontBoldUrl ? fetchFontAsArrayBuffer(fontBoldUrl) : Promise.resolve(null),
    ]);
    if (regularData) {
      return [
        { name: customName, data: regularData, weight: 400, style: 'normal' },
        { name: customName, data: boldData || regularData, weight: 700, style: 'normal' },
      ];
    }
  }
  return loadFonts();
}

/** Run Satori + optional Resvg conversion for a given HTML string and canvas dimensions. */
async function satoriRender(htmlContent, canvasWidth, canvasHeight, scale, format, fonts) {
  const markup = html(htmlContent);

  const svg = await satori(markup, {
    width: canvasWidth,
    height: canvasHeight,
    fonts,
    loadAdditionalAsset: async (code, segment) => {
      if (code === 'emoji') return fetchEmoji(segment);
      return loadLanguageFont(code);
    },
  });

  if (format === 'svg') {
    return { data: Buffer.from(svg), format: 'svg', contentType: 'image/svg+xml' };
  }

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: canvasWidth * scale },
  });
  const pngBuffer = resvg.render().asPng();
  return { data: pngBuffer, format: 'png', contentType: 'image/png' };
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
    // Custom fonts
    fontFamily = null,
    fontUrl = null,
    fontBoldUrl = null,
    // Phone mockup frame
    frame = null,
    // Custom gradient colors (override named backgroundGradient)
    gradientFrom = null,
    gradientTo = null,
    gradientAngle = 135,
  } = options;

  // Pre-fetch all remote images in parallel, using optimally-sized Twitter CDN variants.
  const imageSize = pickImageSize(width, scale);
  const imageMap = await preFetchAllImages(tweet, { imageSize });

  // Pre-fetch logo — add to imageMap so the VDOM walker injects it
  if (logo) {
    const logoBase64 = await fetchImageAsBase64(logo);
    if (logoBase64) imageMap.set(logo, logoBase64);
  }

  // Resolve whether a gradient (named or custom) is active
  const hasCustomGradient = !!(gradientFrom && gradientTo);
  const hasGradient = !!(backgroundGradient || backgroundImage || hasCustomGradient);
  const hasFixedDimensions = !!(canvasWidthOverride && canvasHeightOverride);
  const gradientPad = hasGradient ? GRADIENT_FRAME_PADDING : 0;

  const contentHeight = calculateHeight(tweet, { padding, hideMedia, hideQuoteTweet, showMetrics, hideDate, showUrl });

  // Phone chrome adds fixed pixel amounts to canvas dimensions
  const phoneExtraWidth = frame === 'phone' ? PHONE_CHROME.border * 2 : 0;
  const phoneExtraHeight = frame === 'phone'
    ? PHONE_CHROME.notch + PHONE_CHROME.homeBar + PHONE_CHROME.border * 2
    : 0;

  let canvasWidth, canvasHeight;
  if (hasFixedDimensions) {
    canvasWidth = canvasWidthOverride;
    canvasHeight = Math.max(canvasHeightOverride, contentHeight + phoneExtraHeight + gradientPad * 2);
  } else if (hasGradient) {
    const baseWidth = frame === 'phone'
      ? width + phoneExtraWidth
      : width + padding * 2;
    canvasWidth = baseWidth + gradientPad * 2;
    canvasHeight = contentHeight + phoneExtraHeight + gradientPad * 2;
  } else {
    canvasWidth = frame === 'phone' ? width + phoneExtraWidth : width + padding * 2;
    canvasHeight = contentHeight + phoneExtraHeight;
  }

  const needsWrapper = hasGradient || hasFixedDimensions;

  const htmlContent = generateTweetHtml(tweet, theme, {
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
    fontFamily,
    logo,
    logoPosition,
    logoSize,
    frame,
    gradientFrom,
    gradientTo,
    gradientAngle,
    canvasWidth: needsWrapper ? canvasWidth : null,
    canvasHeight: needsWrapper ? canvasHeight : null,
  });

  // Parse HTML → VDOM (fast: no base64 in the string, just short URLs)
  const markup = html(htmlContent);

  // Inject base64 images into the VDOM tree (bypasses satori-html's O(n²) parser)
  injectImageSources(markup, imageMap);

  const fonts = await resolveFonts(fontUrl, fontBoldUrl, fontFamily);

  // Generate SVG with Satori
  const svg = await satori(markup, {
    width: canvasWidth,
    height: canvasHeight,
    fonts,
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
      value: canvasWidth * scale,
    },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  return { data: pngBuffer, format: 'png', contentType: 'image/png' };
}

/**
 * Render a thread of tweets (from fetchThread()) as a single image.
 * Pre-fetches all images from all tweets, renders them stacked with connector lines.
 * @param {object[]} tweets - Tweet array from fetchThread(), oldest first
 * @param {object} [options] - Same render options as renderTweetToImage
 * @returns {Promise<{data: Buffer, format: string, contentType: string}>}
 */
export async function renderThreadToImage(tweets, options = {}) {
  const {
    theme = 'dark',
    width = 550,
    showMetrics = true,
    format = 'png',
    scale = 2,
    hideMedia = false,
    hideVerified = false,
    backgroundColor = null,
    backgroundGradient = null,
    backgroundImage = null,
    textColor = null,
    linkColor = null,
    padding = 20,
    borderRadius = 16,
    hideShadow = false,
    fontFamily = null,
    fontUrl = null,
    fontBoldUrl = null,
    canvasWidth: canvasWidthOverride = null,
    canvasHeight: canvasHeightOverride = null,
    gradientFrom = null,
    gradientTo = null,
    gradientAngle = 135,
  } = options;

  // Use 'small' images for threads — many tweets means many images, avoid timeouts
  const imageSize = 'small';

  // Pre-fetch images from all tweets in the thread
  const imageMap = new Map();
  await Promise.all(
    tweets.map(tweet =>
      preFetchAllImages(tweet, { imageSize }).then(map => {
        for (const [url, b64] of map) imageMap.set(url, b64);
      })
    )
  );

  const hasCustomGradient = !!(gradientFrom && gradientTo);
  const hasGradient = !!(backgroundGradient || backgroundImage || hasCustomGradient);
  const hasFixedDimensions = !!(canvasWidthOverride && canvasHeightOverride);
  const gradientPad = hasGradient ? GRADIENT_FRAME_PADDING : 0;

  const contentHeight = calculateThreadHeight(tweets, { padding, hideMedia, showMetrics });

  let canvasWidth, canvasHeight;
  if (hasFixedDimensions) {
    canvasWidth = canvasWidthOverride;
    canvasHeight = Math.max(canvasHeightOverride, contentHeight + gradientPad * 2);
  } else if (hasGradient) {
    canvasWidth = width + padding * 2 + gradientPad * 2;
    canvasHeight = contentHeight + gradientPad * 2;
  } else {
    canvasWidth = width + padding * 2;
    canvasHeight = contentHeight;
  }

  const needsWrapper = hasGradient || hasFixedDimensions;

  const htmlContent = generateThreadHtml(tweets, theme, {
    showMetrics,
    width,
    padding,
    hideMedia,
    hideVerified,
    backgroundColor,
    backgroundGradient,
    backgroundImage,
    textColor,
    linkColor,
    borderRadius,
    hideShadow,
    fontFamily,
    gradientFrom,
    gradientTo,
    gradientAngle,
    canvasWidth: needsWrapper ? canvasWidth : null,
    canvasHeight: needsWrapper ? canvasHeight : null,
  });

  const markup = html(htmlContent);
  injectImageSources(markup, imageMap);

  const fonts = await resolveFonts(fontUrl, fontBoldUrl, fontFamily);

  const svg = await satori(markup, {
    width: canvasWidth,
    height: canvasHeight,
    fonts,
    loadAdditionalAsset: async (code, segment) => {
      if (code === 'emoji') return fetchEmoji(segment);
      return loadLanguageFont(code);
    },
  });

  if (format === 'svg') {
    return { data: Buffer.from(svg), format: 'svg', contentType: 'image/svg+xml' };
  }

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: canvasWidth * scale },
  });
  const pngBuffer = resvg.render().asPng();
  return { data: pngBuffer, format: 'png', contentType: 'image/png' };
}
