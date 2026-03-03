#!/usr/bin/env node

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { html } from 'satori-html';
import fs from 'fs';
import path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const THEMES = {
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

// ============================================================================
// TWEET DATA FETCHING
// ============================================================================

function extractTweetId(input) {
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
  
  throw new Error(`Could not extract tweet ID from: ${input}`);
}

async function fetchTweet(tweetId) {
  const token = Math.floor(Math.random() * 1000000);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${token}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch tweet: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  
  if (!data.text) {
    throw new Error('Tweet not found or unavailable');
  }
  
  return data;
}

// ============================================================================
// IMAGE UTILITIES
// ============================================================================

async function fetchImageAsBase64(url) {
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

function formatDate(dateString) {
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

function formatNumber(num) {
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

function generateTweetHtml(tweet, theme, options = {}) {
  const colors = THEMES[theme] || THEMES.dark;
  const { showMetrics = true, width = 550 } = options;
  
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
        `<span style="color: ${colors.link}">${displayUrl}</span>`
      );
    }
  }
  
  // Handle user mentions - make them blue
  if (tweet.entities?.user_mentions) {
    for (const mention of tweet.entities.user_mentions) {
      tweetText = tweetText.replace(
        new RegExp(`@${mention.screen_name}`, 'gi'),
        `<span style="color: ${colors.link}">@${mention.screen_name}</span>`
      );
    }
  }
  
  // Handle hashtags - make them blue
  if (tweet.entities?.hashtags) {
    for (const hashtag of tweet.entities.hashtags) {
      tweetText = tweetText.replace(
        new RegExp(`#${hashtag.text}`, 'gi'),
        `<span style="color: ${colors.link}">#${hashtag.text}</span>`
      );
    }
  }
  
  const verifiedBadge = isVerified ? `
    <svg viewBox="0 0 22 22" width="18" height="18" style="margin-left: 4px;">
      <path fill="${colors.link}" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/>
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
  
  return `
    <div style="display: flex; flex-direction: column; padding: 20px; background: ${colors.bg}; border-radius: 16px; width: ${width}px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <!-- Header: Profile pic + name -->
      <div style="display: flex; align-items: center; gap: 12px;">
        <img src="${profilePic}" style="width: 48px; height: 48px; border-radius: 50%;" />
        <div style="display: flex; flex-direction: column;">
          <div style="display: flex; align-items: center;">
            <span style="font-weight: 700; font-size: 15px; color: ${colors.text};">${userName}</span>
            ${verifiedBadge}
          </div>
          <span style="font-size: 15px; color: ${colors.textSecondary};">@${userHandle}</span>
        </div>
        <!-- X logo -->
        <div style="display: flex; margin-left: auto;">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="${colors.text}">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        </div>
      </div>
      
      <!-- Tweet text -->
      <div style="display: flex; flex-direction: column; margin-top: 12px; font-size: 17px; line-height: 1.5; color: ${colors.text};">
        ${tweetText}
      </div>
      
      <!-- Media -->
      ${mediaHtml}
      
      <!-- Timestamp -->
      <div style="display: flex; margin-top: 16px; font-size: 15px; color: ${colors.textSecondary};">
        ${formatDate(tweet.created_at)}
      </div>
      
      <!-- Metrics -->
      ${metricsHtml}
    </div>
  `;
}

// ============================================================================
// RENDERING
// ============================================================================

async function loadFonts() {
  // Load Inter font from Google Fonts (regular and bold)
  const fonts = [];
  
  try {
    // Inter Regular
    const regularUrl = 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff';
    const regularResponse = await fetch(regularUrl);
    if (regularResponse.ok) {
      const regularData = await regularResponse.arrayBuffer();
      fonts.push({
        name: 'Inter',
        data: regularData,
        weight: 400,
        style: 'normal',
      });
    }
    
    // Inter Bold  
    const boldUrl = 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI2fAZ9hjp-Ek-_EeA.woff';
    const boldResponse = await fetch(boldUrl);
    if (boldResponse.ok) {
      const boldData = await boldResponse.arrayBuffer();
      fonts.push({
        name: 'Inter',
        data: boldData,
        weight: 700,
        style: 'normal',
      });
    }
  } catch (e) {
    console.error('Failed to load fonts:', e.message);
  }
  
  if (fonts.length === 0) {
    throw new Error('Failed to load any fonts. At least one font is required.');
  }
  
  return fonts;
}

async function renderTweetToImage(tweet, options = {}) {
  const {
    theme = 'dark',
    width = 550,
    showMetrics = true,
    format = 'png',
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
  
  const htmlContent = generateTweetHtml(tweet, theme, { showMetrics, width });
  const markup = html(htmlContent);
  
  // Load fonts
  const fonts = await loadFonts();
  
  // Calculate approximate height based on content
  const textLength = tweet.text?.length || 0;
  const hasMedia = (tweet.photos && tweet.photos.length > 0) || (tweet.mediaDetails && tweet.mediaDetails.length > 0);
  const baseHeight = 180; // Header + timestamp
  const textHeight = Math.ceil(textLength / 45) * 28; // ~45 chars per line, 28px line height
  const mediaHeight = hasMedia ? 320 : 0;
  const metricsHeight = showMetrics ? 60 : 0;
  const calculatedHeight = baseHeight + textHeight + mediaHeight + metricsHeight;
  
  // Generate SVG with Satori
  const svg = await satori(markup, {
    width: width + 40, // Add padding
    height: calculatedHeight,
    fonts,
  });
  
  if (format === 'svg') {
    return { data: Buffer.from(svg), format: 'svg' };
  }
  
  // Convert to PNG with Resvg
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: width + 40,
    },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  
  return { data: pngBuffer, format: 'png' };
}

// ============================================================================
// CLI
// ============================================================================

function printUsage() {
  console.log(`
tweet-shots - Generate beautiful tweet screenshots

Usage:
  tweet-shots <tweet-url-or-id> [options]

Options:
  -o, --output <file>    Output file path (default: tweet-<id>.png)
  -t, --theme <theme>    Theme: light, dark, dim, black (default: dark)
  -w, --width <px>       Width in pixels (default: 550)
  --no-metrics           Hide engagement metrics
  --svg                  Output SVG instead of PNG
  -j, --json             Output tweet JSON data
  -h, --help             Show this help

Examples:
  tweet-shots https://x.com/karpathy/status/1617979122625712128
  tweet-shots 1617979122625712128 -t light -o my-tweet.png
  tweet-shots https://twitter.com/elonmusk/status/123456789 --svg
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }
  
  // Parse arguments
  let input = null;
  let output = null;
  let theme = 'dark';
  let width = 550;
  let showMetrics = true;
  let format = 'png';
  let jsonOnly = false;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-o' || arg === '--output') {
      output = args[++i];
    } else if (arg === '-t' || arg === '--theme') {
      theme = args[++i];
    } else if (arg === '-w' || arg === '--width') {
      width = parseInt(args[++i], 10);
    } else if (arg === '--no-metrics') {
      showMetrics = false;
    } else if (arg === '--svg') {
      format = 'svg';
    } else if (arg === '-j' || arg === '--json') {
      jsonOnly = true;
    } else if (!arg.startsWith('-')) {
      input = arg;
    }
  }
  
  if (!input) {
    console.error('Error: No tweet URL or ID provided');
    printUsage();
    process.exit(1);
  }
  
  try {
    // Extract tweet ID
    const tweetId = extractTweetId(input);
    console.log(`Fetching tweet ${tweetId}...`);
    
    // Fetch tweet data
    const tweet = await fetchTweet(tweetId);
    
    if (jsonOnly) {
      console.log(JSON.stringify(tweet, null, 2));
      return;
    }
    
    console.log(`Tweet by @${tweet.user?.screen_name}: "${tweet.text?.substring(0, 50)}..."`);
    console.log(`Rendering with theme: ${theme}`);
    
    // Render to image
    const result = await renderTweetToImage(tweet, {
      theme,
      width,
      showMetrics,
      format,
    });
    
    // Determine output path
    const ext = result.format;
    const outputPath = output || `tweet-${tweetId}.${ext}`;
    
    // Write file
    fs.writeFileSync(outputPath, result.data);
    console.log(`✓ Saved to ${outputPath}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
