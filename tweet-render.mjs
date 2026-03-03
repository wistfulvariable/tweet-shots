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

export async function fetchImageAsBase64(url) {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return `data:${contentType};base64,${base64}`;
  } catch (e) {
    console.error('Failed to fetch image:', url, e.message);
    return null;
  }
}

// Pre-fetch a user's profile image and replace URL with base64 data URI in-place
async function preFetchProfileImage(user) {
  if (user?.profile_image_url_https) {
    const base64 = await fetchImageAsBase64(getHighResProfileUrl(user));
    if (base64) user.profile_image_url_https = base64;
  }
}

// Pre-fetch media images from mediaDetails + photos arrays, replacing URLs with base64 in-place.
// When onlyFirst is true, only the first image from each array is fetched (used for quote tweets).
async function preFetchMediaImages(tweet, { onlyFirst = false } = {}) {
  const limit = onlyFirst ? 1 : Infinity;
  if (tweet.mediaDetails) {
    for (let i = 0; i < Math.min(tweet.mediaDetails.length, limit); i++) {
      if (tweet.mediaDetails[i].media_url_https) {
        const base64 = await fetchImageAsBase64(tweet.mediaDetails[i].media_url_https);
        if (base64) tweet.mediaDetails[i].media_url_https = base64;
      }
    }
  }
  if (tweet.photos) {
    for (let i = 0; i < Math.min(tweet.photos.length, limit); i++) {
      if (tweet.photos[i].url) {
        const base64 = await fetchImageAsBase64(tweet.photos[i].url);
        if (base64) tweet.photos[i].url = base64;
      }
    }
  }
}

// ============================================================================
// FONT LOADING
// ============================================================================

// Module-level font cache — loaded once per process
let _cachedFonts = null;

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
    } catch { /* fall through to network fetch */ }
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
      console.error('Failed to load fonts:', e.message);
    }
  }

  if (fonts.length === 0) {
    throw new Error('Failed to load any fonts. At least one font is required.');
  }

  _cachedFonts = fonts;
  return fonts;
}

// ============================================================================
// RENDERING
// ============================================================================

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

  // Pre-fetch all remote images and replace URLs with base64 data URIs
  await preFetchProfileImage(tweet.user);
  await preFetchMediaImages(tweet);
  if (tweet.quoted_tweet) {
    await preFetchProfileImage(tweet.quoted_tweet.user);
    await preFetchMediaImages(tweet.quoted_tweet, { onlyFirst: true });
  }

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

  // Calculate approximate height based on content
  const textLength = tweet.text?.length || 0;
  const hasMedia = !hideMedia && ((tweet.photos && tweet.photos.length > 0) || (tweet.mediaDetails && tweet.mediaDetails.length > 0));
  const hasQuoteTweet = !hideQuoteTweet && !!tweet.quoted_tweet;
  const baseHeight = 140 + (padding * 2);
  const textHeight = Math.ceil(textLength / 45) * 28;
  const mediaHeight = hasMedia ? 320 : 0;
  const quoteTweetHeight = hasQuoteTweet ? 120 : 0;
  const metricsHeight = showMetrics ? 60 : 0;
  const dateHeight = hideDate ? 0 : 40;
  const calculatedHeight = baseHeight + textHeight + mediaHeight + quoteTweetHeight + metricsHeight + dateHeight;

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
