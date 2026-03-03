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

// Dimension presets for social media
const DIMENSIONS = {
  auto: { width: 550, height: null }, // Auto height based on content
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
const GRADIENTS = {
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
          `<span style="color: ${colors.link}">${displayUrl}</span>`
        );
      }
    }
    
    const qtVerifiedBadge = qtIsVerified ? `
      <svg viewBox="0 0 22 22" width="14" height="14" style="margin-left: 2px;">
        <path fill="${colors.link}" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/>
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
          <!-- Quote tweet header -->
          <div style="display: flex; align-items: center; gap: 6px;">
            <img src="${qtProfilePic}" width="20" height="20" style="border-radius: 50%;" />
            <span style="font-weight: 700; font-size: 13px; color: ${colors.text};">${qtUserName}</span>
            ${qtVerifiedBadge}
            <span style="font-size: 13px; color: ${colors.textSecondary};">@${qtUserHandle}</span>
          </div>
          <!-- Quote tweet text -->
          <div style="display: flex; margin-top: 4px; font-size: 14px; line-height: 1.4; color: ${colors.text};">
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
  
  const htmlContent = generateTweetHtml(tweet, theme, { 
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
  const markup = html(htmlContent);
  
  // Load fonts
  const fonts = await loadFonts();
  
  // Calculate approximate height based on content
  const textLength = tweet.text?.length || 0;
  const hasMedia = !hideMedia && ((tweet.photos && tweet.photos.length > 0) || (tweet.mediaDetails && tweet.mediaDetails.length > 0));
  const hasQuoteTweet = !hideQuoteTweet && !!tweet.quoted_tweet;
  const baseHeight = 140 + (padding * 2); // Header + padding
  const textHeight = Math.ceil(textLength / 45) * 28; // ~45 chars per line, 28px line height
  const mediaHeight = hasMedia ? 320 : 0;
  const quoteTweetHeight = hasQuoteTweet ? 120 : 0; // Quote tweet box
  const metricsHeight = showMetrics ? 60 : 0;
  const dateHeight = hideDate ? 0 : 40;
  const calculatedHeight = baseHeight + textHeight + mediaHeight + quoteTweetHeight + metricsHeight + dateHeight;
  
  // Apply scale
  const scaledWidth = (width + padding * 2) * scale;
  const scaledHeight = calculatedHeight * scale;
  
  // Generate SVG with Satori
  const svg = await satori(markup, {
    width: width + padding * 2,
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
      value: scaledWidth,
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

Basic Options:
  -o, --output <file>      Output file path (default: tweet-<id>.png)
  -t, --theme <theme>      Theme: light, dark, dim, black (default: dark)
  -d, --dimension <preset> Dimension preset (default: auto)
  -w, --width <px>         Width in pixels (default: 550, overrides dimension)
  --svg                    Output SVG instead of PNG
  -j, --json               Output tweet JSON data
  --scale <n>              Scale factor: 1, 2, or 3 (default: 1)
  -h, --help               Show this help

Hide/Show Options:
  --no-metrics             Hide engagement metrics
  --no-media               Hide images/videos
  --no-verified            Hide verified badge
  --no-date                Hide timestamp
  --no-quote               Hide quote tweet
  --no-shadow              Hide shadow effect

Styling Options:
  --bg-color <hex>         Background color (e.g., #ff0000)
  --bg-gradient <name>     Gradient: sunset, ocean, forest, fire, midnight, sky, candy, peach
  --bg-image <url>         Background image URL
  --text-color <hex>       Primary text color
  --link-color <hex>       Link/mention color
  --padding <px>           Padding around tweet (default: 20)
  --radius <px>            Border radius (default: 16)

Dimension Presets:
  auto              Auto height (default, 550px wide)
  instagramFeed     1080x1080 (square)
  instagramStory    1080x1920 (vertical)
  instagramVertical 1080x1350 (portrait)
  tiktok            1080x1920 (vertical)
  linkedin          1200x627 (horizontal)
  twitter           1200x675 (horizontal)
  facebook          1200x630 (horizontal)
  youtube           1280x720 (16:9)

Examples:
  tweet-shots https://x.com/karpathy/status/1617979122625712128
  tweet-shots 1617979122625712128 -t light -d instagramFeed
  tweet-shots <url> --bg-gradient ocean --no-shadow
  tweet-shots <url> --bg-color "#1a1a2e" --text-color "#eee"
  tweet-shots <url> -d tiktok --scale 2 -o story.png
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }
  
  // Parse arguments with defaults
  const options = {
    input: null,
    output: null,
    theme: 'dark',
    dimension: 'auto',
    width: null, // null means use dimension preset
    format: 'png',
    jsonOnly: false,
    scale: 1,
    // Hide/show
    showMetrics: true,
    hideMedia: false,
    hideVerified: false,
    hideDate: false,
    hideQuoteTweet: false,
    hideShadow: false,
    // Styling
    backgroundColor: null,
    backgroundGradient: null,
    backgroundImage: null,
    textColor: null,
    linkColor: null,
    padding: 20,
    borderRadius: 16,
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-o' || arg === '--output') {
      options.output = args[++i];
    } else if (arg === '-t' || arg === '--theme') {
      options.theme = args[++i];
    } else if (arg === '-d' || arg === '--dimension') {
      options.dimension = args[++i];
    } else if (arg === '-w' || arg === '--width') {
      options.width = parseInt(args[++i], 10);
    } else if (arg === '--scale') {
      options.scale = parseInt(args[++i], 10);
    } else if (arg === '--no-metrics') {
      options.showMetrics = false;
    } else if (arg === '--no-media') {
      options.hideMedia = true;
    } else if (arg === '--no-verified') {
      options.hideVerified = true;
    } else if (arg === '--no-date') {
      options.hideDate = true;
    } else if (arg === '--no-quote') {
      options.hideQuoteTweet = true;
    } else if (arg === '--no-shadow') {
      options.hideShadow = true;
    } else if (arg === '--bg-color') {
      options.backgroundColor = args[++i];
    } else if (arg === '--bg-gradient') {
      options.backgroundGradient = args[++i];
    } else if (arg === '--bg-image') {
      options.backgroundImage = args[++i];
    } else if (arg === '--text-color') {
      options.textColor = args[++i];
    } else if (arg === '--link-color') {
      options.linkColor = args[++i];
    } else if (arg === '--padding') {
      options.padding = parseInt(args[++i], 10);
    } else if (arg === '--radius') {
      options.borderRadius = parseInt(args[++i], 10);
    } else if (arg === '--svg') {
      options.format = 'svg';
    } else if (arg === '-j' || arg === '--json') {
      options.jsonOnly = true;
    } else if (!arg.startsWith('-')) {
      options.input = arg;
    }
  }
  
  // Apply dimension preset if no explicit width
  if (!options.width && DIMENSIONS[options.dimension]) {
    options.width = DIMENSIONS[options.dimension].width;
  } else if (!options.width) {
    options.width = 550;
  }
  
  const width = options.width;
  const showMetrics = options.showMetrics;
  const format = options.format;
  const jsonOnly = options.jsonOnly;
  const input = options.input;
  const output = options.output;
  const theme = options.theme;
  
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
    console.log(`Rendering with theme: ${theme}, dimension: ${options.dimension}`);
    
    // Render to image
    const result = await renderTweetToImage(tweet, {
      theme,
      width,
      showMetrics,
      format,
      scale: options.scale,
      hideMedia: options.hideMedia,
      hideVerified: options.hideVerified,
      hideDate: options.hideDate,
      hideQuoteTweet: options.hideQuoteTweet,
      hideShadow: options.hideShadow,
      backgroundColor: options.backgroundColor,
      backgroundGradient: options.backgroundGradient,
      backgroundImage: options.backgroundImage,
      textColor: options.textColor,
      linkColor: options.linkColor,
      padding: options.padding,
      borderRadius: options.borderRadius,
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
