/**
 * Tweet HTML template generation — converts tweet data + theme/options
 * into an HTML string that Satori can render to SVG.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

export const THEMES = {
  light: {
    bg: '#ffffff',
    text: '#0f1419',
    textSecondary: '#536471',
    border: '#cfd9de',
    link: '#1d9bf0',
  },
  dark: {
    bg: '#15202b',
    text: '#f7f9f9',
    textSecondary: '#8b98a5',
    border: '#38444d',
    link: '#1d9bf0',
  },
  dim: {
    bg: '#1e2732',
    text: '#f7f9f9',
    textSecondary: '#8b98a5',
    border: '#38444d',
    link: '#1d9bf0',
  },
  black: {
    bg: '#000000',
    text: '#e7e9ea',
    textSecondary: '#71767b',
    border: '#2f3336',
    link: '#1d9bf0',
  }
};

// Watermark colors per theme — muted, subtle branding text
export const WATERMARK_COLORS = {
  light: '#b0b8bf',
  dark:  '#4a545e',
  dim:   '#4a545e',
  black: '#3a3e42',
};
export const HEIGHT_WATERMARK = 28;

// Gradient backgrounds
export const GRADIENTS = {
  sunset: 'linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)',
  ocean: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  forest: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
  fire: 'linear-gradient(135deg, #f12711 0%, #f5af19 100%)',
  midnight: 'linear-gradient(135deg, #232526 0%, #414345 100%)',
  sky: 'linear-gradient(135deg, #2980b9 0%, #6dd5fa 100%)',
  candy: 'linear-gradient(135deg, #d53369 0%, #daae51 100%)',
  peach: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
};

// Phone mockup chrome dimensions (pixels)
export const PHONE_CHROME = { border: 10, notch: 40, homeBar: 28 };

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

export function formatDate(dateString) {
  const date = new Date(dateString);
  const options = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  };
  const time = date.toLocaleTimeString('en-US', options);

  const dateOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  };
  const dateStr = date.toLocaleDateString('en-US', dateOptions);

  return `${time} · ${dateStr}`;
}

export function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toString();
}

// ============================================================================
// PRIVATE HELPERS
// ============================================================================

// Escape special regex characters to prevent ReDoS from untrusted input
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Process raw tweet text: strip media URLs, escape HTML, colorize entities.
 * Handles URLs (direct replace), mentions and hashtags (regex replace).
 */
function processTweetText(tweet, linkColor) {
  let text = tweet.text || '';

  // Trim to display_text_range — hides reply-to @mentions that Twitter shows separately
  // (e.g. "@user See @user in action" with range [6, 30] → "See @user in action")
  const range = tweet.display_text_range;
  if (range && Array.isArray(range) && range.length === 2 && range[0] > 0) {
    text = text.substring(range[0]);
  }

  // Remove t.co media URLs from text (they show as images instead)
  if (tweet.entities?.media) {
    for (const media of tweet.entities.media) {
      text = text.replace(media.url, '');
    }
  }

  text = text
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  // Colorize URLs
  if (tweet.entities?.urls) {
    for (const url of tweet.entities.urls) {
      const displayUrl = url.display_url || url.expanded_url;
      text = text.replace(
        url.url,
        `<span style="color: ${linkColor}">${displayUrl}</span>`
      );
    }
  }

  // Colorize mentions and hashtags
  if (tweet.entities?.user_mentions) {
    text = colorizeEntities(text, tweet.entities.user_mentions, '@', 'screen_name', linkColor);
  }
  if (tweet.entities?.hashtags) {
    text = colorizeEntities(text, tweet.entities.hashtags, '#', 'text', linkColor);
  }

  return text;
}

/** Replace entity occurrences (e.g. @mention, #hashtag) with colored spans. */
function colorizeEntities(text, entities, prefix, textKey, linkColor) {
  const seen = new Set();
  let result = text;
  for (const entity of entities) {
    const key = entity[textKey].toLowerCase();
    if (seen.has(key)) continue; // global regex already colored all occurrences
    seen.add(key);
    result = result.replace(
      new RegExp(`${prefix}${escapeRegExp(entity[textKey])}`, 'gi'),
      `<span style="color: ${linkColor}">${prefix}${entity[textKey]}</span>`
    );
  }
  return result;
}

// Get high-resolution profile image URL (Twitter uses _normal for 48x48 thumbnails)
export function getHighResProfileUrl(user) {
  return user?.profile_image_url_https?.replace('_normal', '_400x400') || '';
}

/** Get first media URL (used for quote tweet thumbnails only). */
function getFirstMediaUrl(tweet) {
  return tweet.mediaDetails?.[0]?.media_url_https || tweet.photos?.[0]?.url;
}

/** Get all media URLs from a tweet (for the main media grid). */
function getAllMediaUrls(tweet) {
  if (tweet.mediaDetails?.length > 0) {
    return tweet.mediaDetails.map(m => m.media_url_https).filter(Boolean);
  }
  if (tweet.photos?.length > 0) {
    return tweet.photos.map(p => p.url).filter(Boolean);
  }
  return [];
}

/**
 * Build a media grid for 1–4 images using Satori-compatible flexbox.
 * @param {string[]} urls - Image URLs (max 4 used)
 * @param {number} innerWidth - Available width in pixels
 * @param {string} borderColor - CSS color for the container border
 */
function buildMediaGridHtml(urls, innerWidth, borderColor) {
  if (urls.length === 0) return '';

  const border = `1px solid ${borderColor}`;
  const r = 16;
  const wHalf = Math.floor((innerWidth - 2) / 2); // 2px gap between halves

  if (urls.length === 1) {
    return `
      <div style="display: flex; margin-top: 12px; border-radius: ${r}px; overflow: hidden; border: ${border};">
        <img src="${urls[0]}" style="width: ${innerWidth}px; height: 280px; object-fit: cover;" />
      </div>
    `;
  }

  if (urls.length === 2) {
    return `
      <div style="display: flex; flex-direction: row; margin-top: 12px; border-radius: ${r}px; overflow: hidden; border: ${border}; gap: 2px;">
        <img src="${urls[0]}" style="width: ${wHalf}px; height: 220px; object-fit: cover; flex-shrink: 0;" />
        <img src="${urls[1]}" style="width: ${wHalf}px; height: 220px; object-fit: cover; flex-shrink: 0;" />
      </div>
    `;
  }

  if (urls.length === 3) {
    const hHalf = Math.floor((220 - 2) / 2);
    return `
      <div style="display: flex; flex-direction: row; margin-top: 12px; border-radius: ${r}px; overflow: hidden; border: ${border}; gap: 2px;">
        <img src="${urls[0]}" style="width: ${wHalf}px; height: 220px; object-fit: cover; flex-shrink: 0;" />
        <div style="display: flex; flex-direction: column; gap: 2px; flex-shrink: 0;">
          <img src="${urls[1]}" style="width: ${wHalf}px; height: ${hHalf}px; object-fit: cover;" />
          <img src="${urls[2]}" style="width: ${wHalf}px; height: ${hHalf}px; object-fit: cover;" />
        </div>
      </div>
    `;
  }

  // 4+ images: show first 4 in a 2×2 grid
  return `
    <div style="display: flex; flex-direction: column; margin-top: 12px; border-radius: ${r}px; overflow: hidden; border: ${border}; gap: 2px;">
      <div style="display: flex; flex-direction: row; gap: 2px;">
        <img src="${urls[0]}" style="width: ${wHalf}px; height: 160px; object-fit: cover; flex-shrink: 0;" />
        <img src="${urls[1]}" style="width: ${wHalf}px; height: 160px; object-fit: cover; flex-shrink: 0;" />
      </div>
      <div style="display: flex; flex-direction: row; gap: 2px;">
        <img src="${urls[2]}" style="width: ${wHalf}px; height: 160px; object-fit: cover; flex-shrink: 0;" />
        <img src="${urls[3]}" style="width: ${wHalf}px; height: 160px; object-fit: cover; flex-shrink: 0;" />
      </div>
    </div>
  `;
}

/** Build the quote tweet embed card. Returns empty string if no quoted tweet. */
function buildQuoteTweetHtml(quotedTweet, colors, finalColors) {
  const qtUserName = quotedTweet.user?.name || 'Unknown';
  const qtUserHandle = quotedTweet.user?.screen_name || 'unknown';
  const qtIsVerified = quotedTweet.user?.is_blue_verified || quotedTweet.user?.verified;
  const qtProfilePic = getHighResProfileUrl(quotedTweet.user);

  // Process quote tweet text
  let qtText = quotedTweet.text || '';
  // Trim reply-to prefix from quoted tweets that are replies
  const qtRange = quotedTweet.display_text_range;
  if (qtRange && Array.isArray(qtRange) && qtRange.length === 2 && qtRange[0] > 0) {
    qtText = qtText.substring(qtRange[0]);
  }
  if (quotedTweet.entities?.media) {
    for (const media of quotedTweet.entities.media) {
      qtText = qtText.replace(media.url, '');
    }
  }
  // Decode HTML entities from Twitter API (they come pre-encoded)
  qtText = qtText
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
    .replace(/\n/g, ' '); // Single line for compactness

  // Truncate if too long
  if (qtText.length > 200) {
    qtText = qtText.substring(0, 197) + '...';
  }

  // Handle URLs in quote tweet
  if (quotedTweet.entities?.urls) {
    for (const url of quotedTweet.entities.urls) {
      const displayUrl = url.display_url || url.expanded_url;
      qtText = qtText.replace(
        url.url,
        `<span style="color: ${finalColors.link}">${displayUrl}</span>`
      );
    }
  }

  const qtVerifiedBadge = qtIsVerified ? verifiedBadgeSvg(finalColors.link, 14) : '';

  // Quote tweet media (smaller thumbnail — first image only)
  let qtMediaHtml = '';
  const qtMediaUrl = getFirstMediaUrl(quotedTweet);
  if (qtMediaUrl) {
    qtMediaHtml = `
      <div style="display: flex; width: 80px; height: 80px; flex-shrink: 0; border-radius: 8px; overflow: hidden; margin-left: auto;">
        <img src="${qtMediaUrl}" style="width: 80px; height: 80px; object-fit: cover;" />
      </div>
    `;
  }

  return `
    <div style="display: flex; flex-direction: row; margin-top: 12px; padding: 12px; border: 1px solid ${colors.border}; border-radius: 16px; gap: 12px;">
      <div style="display: flex; flex-direction: column; flex: 1; overflow: hidden;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <img src="${qtProfilePic}" style="width: 20px; height: 20px; border-radius: 50%;" />
          <span style="font-weight: 700; font-size: 13px; color: ${finalColors.text};">${qtUserName}</span>
          ${qtVerifiedBadge}
          <span style="font-size: 13px; color: ${colors.textSecondary};">@${qtUserHandle}</span>
        </div>
        <div style="display: flex; margin-top: 4px; font-size: 14px; line-height: 1.4; color: ${finalColors.text};">
          ${qtText}
        </div>
      </div>
      ${qtMediaHtml}
    </div>
  `;
}

/** Build the engagement metrics bar (replies, retweets, likes, views). */
function buildMetricsHtml(tweet, colors) {
  const replies = tweet.conversation_count || 0;
  const retweets = tweet.retweet_count || 0;
  const likes = tweet.favorite_count || 0;
  const views = tweet.views_count || tweet.ext_views?.count || 0;

  const metricStyle = `display: flex; align-items: center; gap: 6px; color: ${colors.textSecondary}; font-size: 15px;`;

  return `
    <div style="display: flex; align-items: center; gap: 24px; margin-top: 16px; padding-top: 16px; border-top: 1px solid ${colors.border};">
      <div style="${metricStyle}">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="${colors.textSecondary}">
          <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"/>
        </svg>
        <span>${formatNumber(replies)}</span>
      </div>
      <div style="${metricStyle}">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="${colors.textSecondary}">
          <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/>
        </svg>
        <span>${formatNumber(retweets)}</span>
      </div>
      <div style="${metricStyle}">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="${colors.textSecondary}">
          <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/>
        </svg>
        <span>${formatNumber(likes)}</span>
      </div>
      ${views > 0 ? `
      <div style="${metricStyle}">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="${colors.textSecondary}">
          <path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"/>
        </svg>
        <span>${formatNumber(views)}</span>
      </div>
      ` : ''}
    </div>
  `;
}

// Verified badge SVG — reused for main tweet (18px) and quote tweet (14px)
function verifiedBadgeSvg(color, size = 18) {
  const ml = size >= 18 ? 4 : 2;
  return `<svg viewBox="0 0 22 22" width="${size}" height="${size}" style="margin-left: ${ml}px;">
      <path fill="${color}" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/>
    </svg>`;
}

// ============================================================================
// HTML TEMPLATE GENERATION
// ============================================================================

// Padding around the tweet card when displayed on a gradient/canvas background
export const GRADIENT_FRAME_PADDING = 40;

// Shadow preset system — configurable shadow styles, intensities, and directions
export const SHADOW_STYLES = {
  none:   null,
  spread: { blur: 32, spread: 0 },   // wide diffuse shadow (default)
  hug:    { blur: 8, spread: 2 },     // tight to card
};

export const SHADOW_INTENSITIES = { low: 0.15, medium: 0.35, high: 0.55 };

export const SHADOW_DIRECTIONS = {
  center: [0, 0], top: [0, -1], 'top-right': [1, -1],
  right: [1, 0], 'bottom-right': [1, 1], bottom: [0, 1],
  'bottom-left': [-1, 1], left: [-1, 0], 'top-left': [-1, -1],
};

const SHADOW_OFFSET_BASE = 8;

export function buildShadowCss(opts = {}) {
  const { shadowStyle = 'spread', shadowIntensity = 'medium',
          shadowDirection = 'bottom', hideShadow = false, needsWrapper = true } = opts;
  if (hideShadow || !needsWrapper || shadowStyle === 'none') return '';
  const style = SHADOW_STYLES[shadowStyle] || SHADOW_STYLES.spread;
  if (!style) return '';
  const intensity = SHADOW_INTENSITIES[shadowIntensity] ?? 0.35;
  const [dx, dy] = SHADOW_DIRECTIONS[shadowDirection] || [0, 1];
  return `box-shadow: ${dx * SHADOW_OFFSET_BASE}px ${dy * SHADOW_OFFSET_BASE}px ${style.blur}px ${style.spread}px rgba(0,0,0,${intensity});`;
}

// ============================================================================
// BACKGROUND PATTERNS
// ============================================================================

export const PATTERN_TYPES = ['dots', 'grid', 'stripes', 'waves', 'diagonal'];

/**
 * Generate a self-contained SVG string for a background pattern.
 * @param {string} type - Pattern type (dots, grid, stripes, waves, diagonal)
 * @param {number} width - Canvas width in px
 * @param {number} height - Canvas height in px
 * @param {object} [opts]
 * @param {string} [opts.color='rgba(255,255,255,0.15)'] - Pattern element color
 * @param {number} [opts.spacing=30] - Spacing between pattern elements
 * @returns {string|null} SVG string, or null for unknown type
 */
export function generatePatternSvg(type, width, height, { color = 'rgba(255,255,255,0.15)', spacing = 30 } = {}) {
  const s = spacing;
  switch (type) {
    case 'dots':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <defs><pattern id="p" width="${s}" height="${s}" patternUnits="userSpaceOnUse">
          <circle cx="${s/2}" cy="${s/2}" r="2" fill="${color}"/>
        </pattern></defs>
        <rect width="100%" height="100%" fill="url(#p)"/>
      </svg>`;
    case 'grid':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <defs><pattern id="p" width="${s}" height="${s}" patternUnits="userSpaceOnUse">
          <path d="M ${s} 0 L 0 0 0 ${s}" fill="none" stroke="${color}" stroke-width="0.5"/>
        </pattern></defs>
        <rect width="100%" height="100%" fill="url(#p)"/>
      </svg>`;
    case 'stripes':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <defs><pattern id="p" width="${s}" height="${s}" patternUnits="userSpaceOnUse">
          <rect width="${s/4}" height="${s}" fill="${color}"/>
        </pattern></defs>
        <rect width="100%" height="100%" fill="url(#p)"/>
      </svg>`;
    case 'waves': {
      const amp = s / 3;
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <defs><pattern id="p" width="${s * 2}" height="${s}" patternUnits="userSpaceOnUse">
          <path d="M0 ${s/2} Q ${s/2} ${s/2 - amp} ${s} ${s/2} Q ${s*1.5} ${s/2 + amp} ${s*2} ${s/2}"
                fill="none" stroke="${color}" stroke-width="1"/>
        </pattern></defs>
        <rect width="100%" height="100%" fill="url(#p)"/>
      </svg>`;
    }
    case 'diagonal':
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <defs><pattern id="p" width="${s}" height="${s}" patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="${s}" stroke="${color}" stroke-width="0.5"/>
        </pattern></defs>
        <rect width="100%" height="100%" fill="url(#p)"/>
      </svg>`;
    default:
      return null;
  }
}

const DEFAULT_FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function generateTweetHtml(tweet, theme, options = {}) {
  const colors = THEMES[theme] || THEMES.dark;
  const {
    showMetrics = true,
    width = 550,
    padding = 20,
    hideMedia = false,
    hideVerified = false,
    hideDate = false,
    hideQuoteTweet = false,
    hideShadow = false,
    shadowStyle = null,
    shadowIntensity = null,
    shadowDirection = null,
    showUrl = false,
    tweetId = null,
    backgroundColor = null,
    backgroundImage = null,
    backgroundGradient = null,
    textColor = null,
    textSecondaryColor = null,
    linkColor = null,
    borderRadius = 16,
    fontFamily = null,
    // Canvas dimensions for centering within fixed-size output (e.g. dimension presets)
    canvasWidth = null,
    canvasHeight = null,
    // Watermark/logo
    logo = null,
    logoPosition = 'bottom-right',
    logoSize = 40,
    // Phone mockup frame
    frame = null,
    // Custom gradient colors (take priority over named backgroundGradient)
    gradientFrom = null,
    gradientTo = null,
    gradientAngle = 135,
    // Internal watermark flag (injected server-side, not user-facing)
    watermark = false,
  } = options;

  const resolvedFontFamily = fontFamily || DEFAULT_FONT_FAMILY;

  // Override colors if custom colors provided
  const finalColors = {
    ...colors,
    text: textColor || colors.text,
    textSecondary: textSecondaryColor || colors.textSecondary,
    link: linkColor || colors.link,
    bg: backgroundColor || colors.bg,
  };

  // Resolve gradient: custom takes priority over named preset
  const resolvedGradient = (gradientFrom && gradientTo)
    ? `linear-gradient(${gradientAngle}deg, ${gradientFrom} 0%, ${gradientTo} 100%)`
    : (backgroundGradient && GRADIENTS[backgroundGradient] ? GRADIENTS[backgroundGradient] : null);

  // Determine if we need a two-layer structure (gradient frame or dimension centering)
  const hasGradientFrame = !!resolvedGradient || !!backgroundImage;
  const hasCanvasDimensions = !!(canvasWidth && canvasHeight);
  const needsWrapper = hasGradientFrame || hasCanvasDimensions;

  // Card always gets a solid background (gradient goes on outer wrapper)
  const cardBg = finalColors.bg;

  // Shadow only when card floats on a gradient/canvas — on transparent
  // backgrounds, shadow pixels bleed out and create visible border artifacts
  const shadow = buildShadowCss({ shadowStyle, shadowIntensity, shadowDirection, hideShadow, needsWrapper });

  const userName = tweet.user?.name || 'Unknown';
  const userHandle = tweet.user?.screen_name || 'unknown';
  const isVerified = tweet.user?.is_blue_verified || tweet.user?.verified;
  const profilePic = getHighResProfileUrl(tweet.user);

  const tweetText = processTweetText(tweet, finalColors.link);

  const verifiedBadge = isVerified ? verifiedBadgeSvg(finalColors.link, 18) : '';

  const metricsHtml = showMetrics ? buildMetricsHtml(tweet, colors) : '';

  const tweetUrl = `https://x.com/${userHandle}/status/${tweetId}`;
  const urlHtml = (showUrl && tweetId) ? `
    <div style="display: flex; margin-top: 12px; font-size: 13px; color: ${finalColors.textSecondary};">
      ${tweetUrl}
    </div>
  ` : '';

  // Media grid — all images from the tweet
  const innerWidth = width - padding * 2;
  const mediaUrls = getAllMediaUrls(tweet);
  const mediaHtml = buildMediaGridHtml(mediaUrls, innerWidth, colors.border);

  const quoteTweetHtml = tweet.quoted_tweet
    ? buildQuoteTweetHtml(tweet.quoted_tweet, colors, finalColors)
    : '';

  // Conditionally render sections
  const dateHtml = hideDate ? '' : `
    <div style="display: flex; margin-top: 16px; font-size: 15px; color: ${finalColors.textSecondary};">
      ${formatDate(tweet.created_at)}
    </div>
  `;

  const finalMediaHtml = hideMedia ? '' : mediaHtml;
  const finalQuoteTweetHtml = hideQuoteTweet ? '' : quoteTweetHtml;
  const finalVerifiedBadge = hideVerified ? '' : verifiedBadge;

  // Logo placement — top positions prepend before header, bottom positions append after metrics
  const logoJustify = (logoPosition === 'top-right' || logoPosition === 'bottom-right') ? 'flex-end' : 'flex-start';
  const logoRow = logo ? `
    <div style="display: flex; justify-content: ${logoJustify};">
      <img src="${logo}" style="width: ${logoSize}px; height: ${logoSize}px; border-radius: 8px; opacity: 0.9;" />
    </div>
  ` : '';
  const logoTop = (logo && logoPosition.startsWith('top-')) ? logoRow : '';
  const logoBottom = (logo && logoPosition.startsWith('bottom-')) ? logoRow : '';

  // Watermark row — subtle branding for free-tier / demo renders
  const watermarkColor = WATERMARK_COLORS[theme] || WATERMARK_COLORS.dark;
  const watermarkRow = watermark ? `
    <div style="display: flex; justify-content: center; margin-top: 8px; padding-top: 6px;">
      <span style="font-size: 11px; color: ${watermarkColor}; letter-spacing: 0.5px;">tweet-shots.com</span>
    </div>
  ` : '';

  // Build the tweet card content (shared between wrapper and standalone modes)
  const cardContent = `
      ${logoTop}
      <div style="display: flex; align-items: center; gap: 12px;">
        <img src="${profilePic}" style="width: 48px; height: 48px; border-radius: 50%;" />
        <div style="display: flex; flex-direction: column;">
          <div style="display: flex; align-items: center;">
            <span style="font-weight: 700; font-size: 15px; color: ${finalColors.text};">${userName}</span>
            ${finalVerifiedBadge}
          </div>
          <span style="font-size: 15px; color: ${finalColors.textSecondary};">@${userHandle}</span>
        </div>
        <div style="display: flex; margin-left: auto;">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="${finalColors.text}">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; margin-top: 12px; font-size: 17px; line-height: 1.5; color: ${finalColors.text};">
        ${tweetText}
      </div>
      ${finalMediaHtml}
      ${finalQuoteTweetHtml}
      ${dateHtml}
      ${metricsHtml}
      ${urlHtml}
      ${logoBottom}
      ${watermarkRow}
  `;

  // Phone mockup frame wraps the card content
  if (frame === 'phone') {
    const phoneHtml = `
      <div style="display: flex; flex-direction: column; background: #0d0d0d; border-radius: ${44 + PHONE_CHROME.border}px; padding: ${PHONE_CHROME.border}px;">
        <div style="display: flex; flex-direction: column; background: #1a1a1a; border-radius: 44px; overflow: hidden; width: ${width}px;">
          <div style="display: flex; justify-content: center; align-items: center; height: ${PHONE_CHROME.notch}px; background: #1a1a1a;">
            <div style="display: flex; width: 80px; height: 8px; background: #0d0d0d; border-radius: 10px;"></div>
          </div>
          <div style="display: flex; flex-direction: column; background: ${cardBg};">
            <div style="display: flex; flex-direction: column; padding: ${padding}px;">
              ${cardContent}
            </div>
          </div>
          <div style="display: flex; justify-content: center; align-items: center; height: ${PHONE_CHROME.homeBar}px; background: #1a1a1a;">
            <div style="display: flex; width: 100px; height: 4px; background: #3a3a3a; border-radius: 4px;"></div>
          </div>
        </div>
      </div>
    `;

    if (needsWrapper) {
      let outerBg;
      if (resolvedGradient) {
        outerBg = resolvedGradient;
      } else if (backgroundImage) {
        outerBg = `url(${backgroundImage}) center/cover no-repeat`;
      } else {
        outerBg = cardBg;
      }

      const wrapperW = canvasWidth || (width + PHONE_CHROME.border * 2 + GRADIENT_FRAME_PADDING * 2);
      const heightStyle = canvasHeight ? `height: ${canvasHeight}px;` : '';

      return `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: ${wrapperW}px; ${heightStyle} background: ${outerBg}; font-family: ${resolvedFontFamily};">
        ${phoneHtml}
      </div>
      `;
    }

    return `
    <div style="display: flex; flex-direction: column; font-family: ${resolvedFontFamily};">
      ${phoneHtml}
    </div>
    `;
  }

  if (needsWrapper) {
    // Two-layer: outer canvas/gradient + inner card with solid bg
    let outerBg;
    if (resolvedGradient) {
      outerBg = resolvedGradient;
    } else if (backgroundImage) {
      outerBg = `url(${backgroundImage}) center/cover no-repeat`;
    } else {
      outerBg = cardBg; // Dimension preset without gradient — same bg color
    }

    const wrapperW = canvasWidth || (width + GRADIENT_FRAME_PADDING * 2);
    const heightStyle = canvasHeight ? `height: ${canvasHeight}px;` : '';

    return `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: ${wrapperW}px; ${heightStyle} background: ${outerBg}; font-family: ${resolvedFontFamily};">
      <div style="display: flex; flex-direction: column; padding: ${padding}px; background: ${cardBg}; border-radius: ${borderRadius}px; width: ${width}px; ${shadow}">
        ${cardContent}
      </div>
    </div>
    `;
  }

  // Standard single-layer card (no gradient, no fixed dimensions, no phone frame)
  // No border-radius on standalone cards — rounded corners on a transparent background
  // create anti-aliased fringe pixels visible when composited on any surface.
  // Outer div stays transparent so sharp.trim() can remove height overestimation.
  return `
    <div style="display: flex; flex-direction: column; font-family: ${resolvedFontFamily};">
      <div style="display: flex; flex-direction: column; padding: ${padding}px; background: ${cardBg}; width: ${width}px; ${shadow}">
        ${cardContent}
      </div>
    </div>
  `;
}

// ============================================================================
// THREAD HTML GENERATION
// ============================================================================

/**
 * Generate HTML for a thread of tweets rendered as a single image.
 * Uses a Twitter-style layout: avatar column with connector line + content column.
 * @param {object[]} tweets - Array of tweet objects, oldest first
 * @param {string} theme - Theme name (light/dark/dim/black)
 * @param {object} [options] - Same options as generateTweetHtml
 * @returns {string} HTML string for Satori rendering
 */
export function generateThreadHtml(tweets, theme, options = {}) {
  const colors = THEMES[theme] || THEMES.dark;
  const {
    width = 550,
    padding = 20,
    showMetrics = true,
    hideMedia = false,
    hideVerified = false,
    backgroundColor = null,
    backgroundImage = null,
    backgroundGradient = null,
    textColor = null,
    linkColor = null,
    borderRadius = 16,
    hideShadow = false,
    shadowStyle = null,
    shadowIntensity = null,
    shadowDirection = null,
    fontFamily = null,
    canvasWidth = null,
    canvasHeight = null,
    gradientFrom = null,
    gradientTo = null,
    gradientAngle = 135,
    watermark = false,
  } = options;

  const resolvedFontFamily = fontFamily || DEFAULT_FONT_FAMILY;

  const finalColors = {
    ...colors,
    text: textColor || colors.text,
    link: linkColor || colors.link,
    bg: backgroundColor || colors.bg,
  };

  const cardBg = finalColors.bg;

  // Watermark row for threads
  const watermarkColor = WATERMARK_COLORS[theme] || WATERMARK_COLORS.dark;
  const watermarkRow = watermark ? `
    <div style="display: flex; justify-content: center; margin-top: 8px; padding-top: 6px;">
      <span style="font-size: 11px; color: ${watermarkColor}; letter-spacing: 0.5px;">tweet-shots.com</span>
    </div>
  ` : '';

  // Content column width: card width minus padding on each side, minus avatar col (48px) and gap (12px)
  const threadContentWidth = width - padding * 2 - 48 - 12;

  // Build each tweet row in the thread
  const tweetItems = tweets.map((tweet, index) => {
    const isLast = index === tweets.length - 1;
    const userName = tweet.user?.name || 'Unknown';
    const userHandle = tweet.user?.screen_name || 'unknown';
    const isVerified = (tweet.user?.is_blue_verified || tweet.user?.verified) && !hideVerified;
    const profilePic = getHighResProfileUrl(tweet.user);
    const tweetText = processTweetText(tweet, finalColors.link);
    const verifiedBadge = isVerified ? verifiedBadgeSvg(finalColors.link, 16) : '';
    const dateStr = tweet.created_at ? formatDate(tweet.created_at) : '';

    const mediaUrls = hideMedia ? [] : getAllMediaUrls(tweet);
    const mediaHtml = buildMediaGridHtml(mediaUrls, threadContentWidth, colors.border);

    // Simplified metrics: retweets + likes only (compact for thread view)
    let metricsHtml = '';
    if (showMetrics) {
      const retweets = tweet.retweet_count || 0;
      const likes = tweet.favorite_count || 0;
      const ms = `display: flex; align-items: center; gap: 5px; color: ${colors.textSecondary}; font-size: 13px;`;
      metricsHtml = `
        <div style="display: flex; align-items: center; gap: 18px; margin-top: 10px;">
          <div style="${ms}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="${colors.textSecondary}">
              <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/>
            </svg>
            <span>${formatNumber(retweets)}</span>
          </div>
          <div style="${ms}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="${colors.textSecondary}">
              <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/>
            </svg>
            <span>${formatNumber(likes)}</span>
          </div>
        </div>
      `;
    }

    // Connector line between tweets (not after last tweet)
    const connector = isLast ? '' : `
      <div style="display: flex; width: 2px; background: ${colors.border}; flex: 1; min-height: 12px; margin-top: 4px;" />
    `;

    return `
      <div style="display: flex; flex-direction: row; gap: 12px;">
        <div style="display: flex; flex-direction: column; align-items: center; width: 48px; flex-shrink: 0;">
          <img src="${profilePic}" style="width: 48px; height: 48px; border-radius: 50%;" />
          ${connector}
        </div>
        <div style="display: flex; flex-direction: column; flex: 1; padding-bottom: ${isLast ? 0 : 16}px;">
          <div style="display: flex; flex-direction: row; align-items: center; gap: 6px;">
            <span style="font-weight: 700; font-size: 14px; color: ${finalColors.text};">${userName}</span>
            ${verifiedBadge}
            <span style="font-size: 13px; color: ${colors.textSecondary};">@${userHandle}</span>
            ${dateStr ? `<span style="font-size: 13px; color: ${colors.textSecondary};">· ${dateStr}</span>` : ''}
          </div>
          <div style="display: flex; flex-direction: column; margin-top: 6px; font-size: 16px; line-height: 1.5; color: ${finalColors.text};">
            ${tweetText}
          </div>
          ${mediaHtml}
          ${metricsHtml}
        </div>
      </div>
    `;
  });

  const threadContent = tweetItems.join('');

  // Resolve gradient (same logic as generateTweetHtml)
  const resolvedGradient = (gradientFrom && gradientTo)
    ? `linear-gradient(${gradientAngle}deg, ${gradientFrom} 0%, ${gradientTo} 100%)`
    : (backgroundGradient && GRADIENTS[backgroundGradient] ? GRADIENTS[backgroundGradient] : null);

  const hasGradientFrame = !!resolvedGradient || !!backgroundImage;
  const hasCanvasDimensions = !!(canvasWidth && canvasHeight);
  const needsWrapper = hasGradientFrame || hasCanvasDimensions;

  // Shadow only when card floats on a gradient/canvas — on transparent
  // backgrounds, shadow pixels bleed out and create visible border artifacts
  const shadow = buildShadowCss({ shadowStyle, shadowIntensity, shadowDirection, hideShadow, needsWrapper });

  if (needsWrapper) {
    let outerBg;
    if (resolvedGradient) {
      outerBg = resolvedGradient;
    } else if (backgroundImage) {
      outerBg = `url(${backgroundImage}) center/cover no-repeat`;
    } else {
      outerBg = cardBg;
    }

    const wrapperW = canvasWidth || (width + GRADIENT_FRAME_PADDING * 2);
    const heightStyle = canvasHeight ? `height: ${canvasHeight}px;` : '';

    return `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: ${wrapperW}px; ${heightStyle} background: ${outerBg}; font-family: ${resolvedFontFamily};">
      <div style="display: flex; flex-direction: column; padding: ${padding}px; background: ${cardBg}; border-radius: ${borderRadius}px; width: ${width}px; ${shadow}">
        ${threadContent}
        ${watermarkRow}
      </div>
    </div>
    `;
  }

  // No border-radius on standalone cards — rounded corners on a transparent background
  // create anti-aliased fringe pixels visible when composited on any surface.
  // Outer div stays transparent so sharp.trim() can remove height overestimation.
  return `
    <div style="display: flex; flex-direction: column; font-family: ${resolvedFontFamily};">
      <div style="display: flex; flex-direction: column; padding: ${padding}px; background: ${cardBg}; width: ${width}px; ${shadow}">
        ${threadContent}
        ${watermarkRow}
      </div>
    </div>
  `;
}
