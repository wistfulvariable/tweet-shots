/**
 * tweet-shots core library
 *
 * Shared rendering, fetching, and utility code used by both the CLI
 * (tweet-shots.mjs) and the API server (api-server.mjs).
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { html } from 'satori-html';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppError } from './src/errors.mjs';

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

// ============================================================================
// TWEET DATA FETCHING
// ============================================================================

export function extractTweetId(input) {
  // Handle direct ID
  if (/^\d+$/.test(input)) {
    return input;
  }

  // Handle URLs like:
  // https://twitter.com/user/status/123456789
  // https://x.com/user/status/123456789
  const match = input.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  if (match) {
    return match[1];
  }

  throw new AppError(`Could not extract tweet ID from: ${input}`);
}

export async function fetchTweet(tweetId) {
  const token = Math.floor(Math.random() * 1000000);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${token}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new AppError(`Failed to fetch tweet: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.text) {
    throw new AppError('Tweet not found or unavailable');
  }

  return data;
}

// Fetch a thread (conversation) starting from a tweet
export async function fetchThread(tweetId) {
  const tweets = [];

  // First, get the initial tweet
  const initialTweet = await fetchTweet(tweetId);

  // Check if this tweet is part of a thread (has parent)
  if (initialTweet.parent) {
    // Walk up to find the thread start
    const parents = [];
    let parentTweet = initialTweet;
    while (parentTweet.parent) {
      try {
        const parent = await fetchTweet(parentTweet.parent.id_str);
        // Only include if same author (thread vs reply)
        if (parent.user?.screen_name === initialTweet.user?.screen_name) {
          parents.unshift(parent);
          parentTweet = parent;
        } else {
          break;
        }
      } catch {
        break;
      }
    }
    tweets.push(...parents);
  }

  tweets.push(initialTweet);

  // Note: Syndication API doesn't expose thread continuation (tweets after this one)
  return tweets;
}

// ============================================================================
// AI TRANSLATION
// ============================================================================

export async function translateText(text, targetLang = 'en') {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('OPENAI_API_KEY not set, skipping translation');
    return text;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a translator. Translate the following text to ${targetLang}. Preserve emojis, @mentions, #hashtags, and URLs exactly as they are. Return only the translated text, nothing else.`
          },
          { role: 'user', content: text }
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`Translation API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || text;
  } catch (e) {
    console.error('Translation failed:', e.message);
    return text;
  }
}

// ============================================================================
// BATCH PROCESSING
// ============================================================================

export async function processBatch(urls, options, outputDir = '.') {
  const results = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i].trim();
    if (!url || url.startsWith('#')) continue; // Skip empty lines and comments

    try {
      console.log(`[${i + 1}/${urls.length}] Processing: ${url}`);
      const tweetId = extractTweetId(url);
      const tweet = await fetchTweet(tweetId);

      // Apply translation if requested
      if (options.translate) {
        tweet.text = await translateText(tweet.text, options.translate);
      }

      const result = await renderTweetToImage(tweet, options);

      const outputPath = path.join(outputDir, `tweet-${tweetId}.${result.format}`);
      fs.writeFileSync(outputPath, result.data);

      results.push({ url, tweetId, outputPath, success: true });
      console.log(`  ✓ Saved to ${outputPath}`);

      // Small delay to avoid rate limiting
      if (i < urls.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (e) {
      results.push({ url, success: false, error: e.message });
      console.error(`  ✗ Error: ${e.message}`);
    }
  }

  return results;
}

// ============================================================================
// PDF GENERATION
// ============================================================================

export async function generatePDF(images, outputPath, options = {}) {
  const { title = 'Tweet Thread', author = '' } = options;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false });
    const stream = fs.createWriteStream(outputPath);

    doc.pipe(stream);

    // Add metadata
    doc.info.Title = title;
    if (author) doc.info.Author = author;
    doc.info.Creator = 'tweet-shots';

    // Add each image as a page
    for (const imgBuffer of images) {
      const img = doc.openImage(imgBuffer);

      const padding = 40;
      doc.addPage({
        size: [img.width + padding * 2, img.height + padding * 2],
        margin: 0,
      });

      doc.image(imgBuffer, padding, padding, {
        width: img.width,
        height: img.height,
      });
    }

    doc.end();

    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

// ============================================================================
// LOGO/BRANDING OVERLAY
// ============================================================================

export function addLogoToHtml(baseHtml, logoUrl, position = 'bottom-right', size = 40) {
  const positions = {
    'top-left': 'top: 10px; left: 10px;',
    'top-right': 'top: 10px; right: 10px;',
    'bottom-left': 'bottom: 10px; left: 10px;',
    'bottom-right': 'bottom: 10px; right: 10px;',
  };

  const posStyle = positions[position] || positions['bottom-right'];

  const logoHtml = `
    <img src="${logoUrl}"
         style="position: absolute; ${posStyle} width: ${size}px; height: ${size}px; border-radius: 8px; opacity: 0.9;" />
  `;

  // Insert logo before closing div
  return baseHtml.replace(/<\/div>\s*$/, `${logoHtml}</div>`);
}

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

// ============================================================================
// DATE FORMATTING
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
// HTML TEMPLATE GENERATION
// ============================================================================

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
    backgroundColor = null,
    backgroundImage = null,
    backgroundGradient = null,
    textColor = null,
    textSecondaryColor = null,
    linkColor = null,
    borderRadius = 16,
  } = options;

  // Override colors if custom colors provided
  const finalColors = {
    ...colors,
    text: textColor || colors.text,
    textSecondary: textSecondaryColor || colors.textSecondary,
    link: linkColor || colors.link,
    bg: backgroundColor || colors.bg,
  };

  // Background style
  let bgStyle = `background: ${finalColors.bg};`;
  if (backgroundGradient && GRADIENTS[backgroundGradient]) {
    bgStyle = `background: ${GRADIENTS[backgroundGradient]};`;
  } else if (backgroundImage) {
    bgStyle = `background: url(${backgroundImage}) center/cover no-repeat;`;
  }

  const shadow = hideShadow ? '' : 'box-shadow: 0 4px 12px rgba(0,0,0,0.15);';

  const userName = tweet.user?.name || 'Unknown';
  const userHandle = tweet.user?.screen_name || 'unknown';
  const isVerified = tweet.user?.is_blue_verified || tweet.user?.verified;
  const profilePic = tweet.user?.profile_image_url_https?.replace('_normal', '_400x400') || '';

  // Process tweet text - escape HTML and handle newlines
  let tweetText = tweet.text || '';

  // Remove t.co media URLs from text (they show as images instead)
  if (tweet.entities?.media) {
    for (const media of tweet.entities.media) {
      tweetText = tweetText.replace(media.url, '');
    }
  }

  tweetText = tweetText
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  // Handle URLs in text - make them blue
  if (tweet.entities?.urls) {
    for (const url of tweet.entities.urls) {
      const displayUrl = url.display_url || url.expanded_url;
      tweetText = tweetText.replace(
        url.url,
        `<span style="color: ${finalColors.link}">${displayUrl}</span>`
      );
    }
  }

  // Handle user mentions - make them blue
  if (tweet.entities?.user_mentions) {
    for (const mention of tweet.entities.user_mentions) {
      tweetText = tweetText.replace(
        new RegExp(`@${mention.screen_name}`, 'gi'),
        `<span style="color: ${finalColors.link}">@${mention.screen_name}</span>`
      );
    }
  }

  // Handle hashtags - make them blue
  if (tweet.entities?.hashtags) {
    for (const hashtag of tweet.entities.hashtags) {
      tweetText = tweetText.replace(
        new RegExp(`#${hashtag.text}`, 'gi'),
        `<span style="color: ${finalColors.link}">#${hashtag.text}</span>`
      );
    }
  }

  const verifiedBadge = isVerified ? `
    <svg viewBox="0 0 22 22" width="18" height="18" style="margin-left: 4px;">
      <path fill="${finalColors.link}" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/>
    </svg>
  ` : '';

  // Build metrics section
  let metricsHtml = '';
  if (showMetrics) {
    const replies = tweet.conversation_count || 0;
    const retweets = tweet.retweet_count || 0;
    const likes = tweet.favorite_count || 0;
    const views = tweet.views_count || tweet.ext_views?.count || 0;

    metricsHtml = `
      <div style="display: flex; align-items: center; gap: 24px; margin-top: 16px; padding-top: 16px; border-top: 1px solid ${colors.border};">
        <div style="display: flex; align-items: center; gap: 6px; color: ${colors.textSecondary}; font-size: 15px;">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="${colors.textSecondary}">
            <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"/>
          </svg>
          <span>${formatNumber(replies)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; color: ${colors.textSecondary}; font-size: 15px;">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="${colors.textSecondary}">
            <path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/>
          </svg>
          <span>${formatNumber(retweets)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; color: ${colors.textSecondary}; font-size: 15px;">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="${colors.textSecondary}">
            <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/>
          </svg>
          <span>${formatNumber(likes)}</span>
        </div>
        ${views > 0 ? `
        <div style="display: flex; align-items: center; gap: 6px; color: ${colors.textSecondary}; font-size: 15px;">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="${colors.textSecondary}">
            <path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"/>
          </svg>
          <span>${formatNumber(views)}</span>
        </div>
        ` : ''}
      </div>
    `;
  }

  // Handle media (photos from mediaDetails or photos array)
  let mediaHtml = '';
  const mediaUrl = tweet.mediaDetails?.[0]?.media_url_https || tweet.photos?.[0]?.url;
  if (mediaUrl) {
    mediaHtml = `
      <div style="display: flex; margin-top: 12px; border-radius: 16px; overflow: hidden; border: 1px solid ${colors.border};">
        <img src="${mediaUrl}" width="${width - 40}" height="280" style="object-fit: cover;" />
      </div>
    `;
  }

  // Handle quote tweets
  let quoteTweetHtml = '';
  if (tweet.quoted_tweet) {
    const qt = tweet.quoted_tweet;
    const qtUserName = qt.user?.name || 'Unknown';
    const qtUserHandle = qt.user?.screen_name || 'unknown';
    const qtIsVerified = qt.user?.is_blue_verified || qt.user?.verified;
    const qtProfilePic = qt.user?.profile_image_url_https?.replace('_normal', '_400x400') || '';

    // Process quote tweet text
    let qtText = qt.text || '';
    if (qt.entities?.media) {
      for (const media of qt.entities.media) {
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
    if (qt.entities?.urls) {
      for (const url of qt.entities.urls) {
        const displayUrl = url.display_url || url.expanded_url;
        qtText = qtText.replace(
          url.url,
          `<span style="color: ${finalColors.link}">${displayUrl}</span>`
        );
      }
    }

    const qtVerifiedBadge = qtIsVerified ? `
      <svg viewBox="0 0 22 22" width="14" height="14" style="margin-left: 2px;">
        <path fill="${finalColors.link}" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/>
      </svg>
    ` : '';

    // Quote tweet media (smaller)
    let qtMediaHtml = '';
    const qtMediaUrl = qt.mediaDetails?.[0]?.media_url_https || qt.photos?.[0]?.url;
    if (qtMediaUrl) {
      qtMediaHtml = `
        <img src="${qtMediaUrl}" width="80" height="80" style="border-radius: 8px; object-fit: cover; margin-left: auto;" />
      `;
    }

    quoteTweetHtml = `
      <div style="display: flex; flex-direction: row; margin-top: 12px; padding: 12px; border: 1px solid ${colors.border}; border-radius: 16px; gap: 12px;">
        <div style="display: flex; flex-direction: column; flex: 1;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <img src="${qtProfilePic}" width="20" height="20" style="border-radius: 50%;" />
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

  // Conditionally render sections
  const dateHtml = hideDate ? '' : `
    <div style="display: flex; margin-top: 16px; font-size: 15px; color: ${finalColors.textSecondary};">
      ${formatDate(tweet.created_at)}
    </div>
  `;

  const finalMediaHtml = hideMedia ? '' : mediaHtml;
  const finalQuoteTweetHtml = hideQuoteTweet ? '' : quoteTweetHtml;
  const finalVerifiedBadge = hideVerified ? '' : verifiedBadge;

  return `
    <div style="display: flex; flex-direction: column; padding: ${padding}px; ${bgStyle} border-radius: ${borderRadius}px; width: ${width}px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; ${shadow}">
      <!-- Header: Profile pic + name -->
      <div style="display: flex; align-items: center; gap: 12px;">
        <img src="${profilePic}" style="width: 48px; height: 48px; border-radius: 50%;" />
        <div style="display: flex; flex-direction: column;">
          <div style="display: flex; align-items: center;">
            <span style="font-weight: 700; font-size: 15px; color: ${finalColors.text};">${userName}</span>
            ${finalVerifiedBadge}
          </div>
          <span style="font-size: 15px; color: ${finalColors.textSecondary};">@${userHandle}</span>
        </div>
        <!-- X logo -->
        <div style="display: flex; margin-left: auto;">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="${finalColors.text}">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </div>
      </div>

      <!-- Tweet text -->
      <div style="display: flex; flex-direction: column; margin-top: 12px; font-size: 17px; line-height: 1.5; color: ${finalColors.text};">
        ${tweetText}
      </div>

      <!-- Media -->
      ${finalMediaHtml}

      <!-- Quote Tweet -->
      ${finalQuoteTweetHtml}

      <!-- Timestamp -->
      ${dateHtml}

      <!-- Metrics -->
      ${metricsHtml}
    </div>
  `;
}

// ============================================================================
// RENDERING
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

  // Pre-fetch profile image and convert to base64
  if (tweet.user?.profile_image_url_https) {
    const profilePicUrl = tweet.user.profile_image_url_https.replace('_normal', '_400x400');
    const base64 = await fetchImageAsBase64(profilePicUrl);
    if (base64) {
      tweet.user.profile_image_url_https = base64;
    }
  }

  // Pre-fetch media images (from mediaDetails or photos)
  if (tweet.mediaDetails) {
    for (let i = 0; i < tweet.mediaDetails.length; i++) {
      if (tweet.mediaDetails[i].media_url_https) {
        const base64 = await fetchImageAsBase64(tweet.mediaDetails[i].media_url_https);
        if (base64) {
          tweet.mediaDetails[i].media_url_https = base64;
        }
      }
    }
  }
  if (tweet.photos) {
    for (let i = 0; i < tweet.photos.length; i++) {
      const base64 = await fetchImageAsBase64(tweet.photos[i].url);
      if (base64) {
        tweet.photos[i].url = base64;
      }
    }
  }

  // Pre-fetch quote tweet images
  if (tweet.quoted_tweet) {
    const qt = tweet.quoted_tweet;
    if (qt.user?.profile_image_url_https) {
      const profilePicUrl = qt.user.profile_image_url_https.replace('_normal', '_400x400');
      const base64 = await fetchImageAsBase64(profilePicUrl);
      if (base64) {
        qt.user.profile_image_url_https = base64;
      }
    }
    if (qt.mediaDetails?.[0]?.media_url_https) {
      const base64 = await fetchImageAsBase64(qt.mediaDetails[0].media_url_https);
      if (base64) {
        qt.mediaDetails[0].media_url_https = base64;
      }
    }
    if (qt.photos?.[0]?.url) {
      const base64 = await fetchImageAsBase64(qt.photos[0].url);
      if (base64) {
        qt.photos[0].url = base64;
      }
    }
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
