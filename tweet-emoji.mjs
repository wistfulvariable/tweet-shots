/**
 * Emoji asset loading for Satori — fetches Twemoji SVGs from CDN.
 * Converts emoji grapheme clusters to Twemoji codepoint format and
 * returns SVG data URIs for rendering.
 *
 * Used by loadAdditionalAsset in tweet-render.mjs when Satori
 * encounters emoji characters that Inter font cannot render.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const TWEMOJI_CDN_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg';
const EMOJI_FETCH_TIMEOUT_MS = 5_000;
const EMOJI_CACHE_MAX_SIZE = 500;

// ============================================================================
// MODULE-LEVEL CACHE
// ============================================================================

// Map<string, string|null> — codepoint string → SVG data URI (or null for known 404s)
const _emojiCache = new Map();

// ============================================================================
// CODEPOINT CONVERSION
// ============================================================================

/**
 * Convert an emoji grapheme cluster to the Twemoji codepoint filename format.
 * Twemoji uses lowercase hex codepoints joined by '-', excluding U+FE0F
 * (variation selector 16) in most filenames.
 *
 * Examples:
 *   '😀'       → '1f600'
 *   '👨‍👩‍👧' → '1f468-200d-1f469-200d-1f467'
 *   '🇺🇸'     → '1f1fa-1f1f8'
 *   '👋🏽'     → '1f44b-1f3fd'
 *   '❤️'       → '2764'  (FE0F stripped)
 *
 * @param {string} emoji - The emoji grapheme cluster
 * @returns {string} Hyphen-joined hex codepoints
 */
export function emojiToCodepoint(emoji) {
  const codepoints = [];
  for (const char of emoji) {
    const cp = char.codePointAt(0);
    if (cp === 0xFE0F) continue;
    codepoints.push(cp.toString(16));
  }
  return codepoints.join('-');
}

// ============================================================================
// EMOJI FETCHING
// ============================================================================

/**
 * Fetch a Twemoji SVG for a given emoji grapheme cluster.
 * Returns an SVG data URI string on success, or null on failure.
 * Results are cached in module-level Map (bounded by EMOJI_CACHE_MAX_SIZE).
 *
 * @param {string} emoji - The emoji grapheme cluster (segment from Satori)
 * @returns {Promise<string|null>} SVG data URI or null
 */
export async function fetchEmoji(emoji) {
  const codepoint = emojiToCodepoint(emoji);

  if (_emojiCache.has(codepoint)) {
    return _emojiCache.get(codepoint);
  }

  const url = `${TWEMOJI_CDN_BASE}/${codepoint}.svg`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EMOJI_FETCH_TIMEOUT_MS);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      cacheEmoji(codepoint, null);
      return null;
    }

    const svgText = await response.text();
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svgText).toString('base64')}`;

    cacheEmoji(codepoint, dataUri);
    return dataUri;
  } catch {
    // Network error or timeout — do NOT cache (transient failure)
    return null;
  }
}

/**
 * Add an entry to the emoji cache, evicting oldest entry if over limit.
 * @param {string} codepoint
 * @param {string|null} value
 */
function cacheEmoji(codepoint, value) {
  if (_emojiCache.size >= EMOJI_CACHE_MAX_SIZE) {
    const firstKey = _emojiCache.keys().next().value;
    _emojiCache.delete(firstKey);
  }
  _emojiCache.set(codepoint, value);
}

/** Clear the emoji cache (for testing). */
export function clearEmojiCache() {
  _emojiCache.clear();
}

/** Get current cache size (for testing/monitoring). */
export function getEmojiCacheSize() {
  return _emojiCache.size;
}
