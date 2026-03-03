#!/usr/bin/env node

/**
 * tweet-shots API Server
 * 
 * A production-ready REST API for generating tweet screenshots.
 * 
 * Features:
 * - API key authentication
 * - Rate limiting (configurable per tier)
 * - Usage tracking
 * - Multiple output formats (PNG, SVG, base64, URL)
 * - Full customization options
 * - Health checks and metrics
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import tweet-shots core functions
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { html } from 'satori-html';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',
  
  // API Keys storage (in production, use Redis or a database)
  apiKeysFile: process.env.API_KEYS_FILE || path.join(__dirname, 'api-keys.json'),
  usageFile: process.env.USAGE_FILE || path.join(__dirname, 'usage.json'),
  
  // Rate limits by tier
  rateLimits: {
    free: { windowMs: 60000, max: 10 },      // 10 per minute
    pro: { windowMs: 60000, max: 100 },      // 100 per minute
    business: { windowMs: 60000, max: 1000 }, // 1000 per minute
  },
  
  // Output directory for generated images (optional URL mode)
  outputDir: process.env.OUTPUT_DIR || path.join(__dirname, 'output'),
  publicUrl: process.env.PUBLIC_URL || null, // e.g., https://api.example.com/images
};

// ============================================================================
// THEMES & PRESETS (copied from tweet-shots.mjs)
// ============================================================================

const THEMES = {
  light: { bg: '#ffffff', text: '#0f1419', textSecondary: '#536471', border: '#cfd9de', link: '#1d9bf0' },
  dark: { bg: '#15202b', text: '#f7f9f9', textSecondary: '#8b98a5', border: '#38444d', link: '#1d9bf0' },
  dim: { bg: '#1e2732', text: '#f7f9f9', textSecondary: '#8b98a5', border: '#38444d', link: '#1d9bf0' },
  black: { bg: '#000000', text: '#e7e9ea', textSecondary: '#71767b', border: '#2f3336', link: '#1d9bf0' },
};

const DIMENSIONS = {
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
// DATA STORAGE (Simple JSON - replace with DB in production)
// ============================================================================

function loadJSON(filepath, defaultValue = {}) {
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
  } catch (e) {
    console.error(`Error loading ${filepath}:`, e.message);
  }
  return defaultValue;
}

function saveJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

// API Keys: { "key": { tier: "free|pro|business", name: "...", created: "...", active: true } }
let apiKeys = loadJSON(CONFIG.apiKeysFile, {});

// Usage: { "key": { total: 0, monthly: { "2024-01": 0 }, lastUsed: "..." } }
let usage = loadJSON(CONFIG.usageFile, {});

function trackUsage(apiKey) {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  if (!usage[apiKey]) {
    usage[apiKey] = { total: 0, monthly: {}, lastUsed: null };
  }
  
  usage[apiKey].total++;
  usage[apiKey].monthly[monthKey] = (usage[apiKey].monthly[monthKey] || 0) + 1;
  usage[apiKey].lastUsed = now.toISOString();
  
  // Save periodically (every 10 requests)
  if (usage[apiKey].total % 10 === 0) {
    saveJSON(CONFIG.usageFile, usage);
  }
}

// ============================================================================
// TWEET FETCHING
// ============================================================================

function extractTweetId(input) {
  if (/^\d+$/.test(input)) return input;
  const match = input.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  if (match) return match[1];
  throw new Error(`Invalid tweet URL or ID: ${input}`);
}

async function fetchTweet(tweetId) {
  const token = Math.floor(Math.random() * 1000000);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${token}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch tweet: ${response.status}`);
  }
  
  const data = await response.json();
  if (!data.text) {
    throw new Error('Tweet not found or unavailable');
  }
  
  return data;
}

async function fetchImageAsBase64(url) {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return `data:${contentType};base64,${base64}`;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// RENDERING (simplified from tweet-shots.mjs)
// ============================================================================

function formatDate(dateString) {
  const date = new Date(dateString);
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${time} · ${dateStr}`;
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return num.toString();
}

function generateTweetHtml(tweet, theme, options = {}) {
  const colors = THEMES[theme] || THEMES.dark;
  const {
    showMetrics = true,
    width = 550,
    padding = 20,
    hideMedia = false,
    hideVerified = false,
    hideDate = false,
    hideShadow = false,
    backgroundColor = null,
    backgroundGradient = null,
    textColor = null,
    linkColor = null,
    borderRadius = 16,
  } = options;
  
  const finalColors = {
    ...colors,
    text: textColor || colors.text,
    link: linkColor || colors.link,
    bg: backgroundColor || colors.bg,
  };
  
  let bgStyle = `background: ${finalColors.bg};`;
  if (backgroundGradient && GRADIENTS[backgroundGradient]) {
    bgStyle = `background: ${GRADIENTS[backgroundGradient]};`;
  }
  
  const shadow = hideShadow ? '' : 'box-shadow: 0 4px 12px rgba(0,0,0,0.15);';
  
  const userName = tweet.user?.name || 'Unknown';
  const userHandle = tweet.user?.screen_name || 'unknown';
  const isVerified = !hideVerified && (tweet.user?.is_blue_verified || tweet.user?.verified);
  const profilePic = tweet.user?.profile_image_url_https || '';
  
  let tweetText = tweet.text || '';
  if (tweet.entities?.media) {
    for (const media of tweet.entities.media) {
      tweetText = tweetText.replace(media.url, '');
    }
  }
  tweetText = tweetText.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
  
  const verifiedBadge = isVerified ? `<svg viewBox="0 0 22 22" width="18" height="18" style="margin-left: 4px;"><path fill="${finalColors.link}" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/></svg>` : '';
  
  let metricsHtml = '';
  if (showMetrics) {
    const replies = tweet.conversation_count || 0;
    const retweets = tweet.retweet_count || 0;
    const likes = tweet.favorite_count || 0;
    metricsHtml = `
      <div style="display: flex; align-items: center; gap: 24px; margin-top: 16px; padding-top: 16px; border-top: 1px solid ${finalColors.border || colors.border};">
        <span style="color: ${colors.textSecondary}; font-size: 15px;">💬 ${formatNumber(replies)}</span>
        <span style="color: ${colors.textSecondary}; font-size: 15px;">🔁 ${formatNumber(retweets)}</span>
        <span style="color: ${colors.textSecondary}; font-size: 15px;">❤️ ${formatNumber(likes)}</span>
      </div>
    `;
  }
  
  let mediaHtml = '';
  if (!hideMedia) {
    const mediaUrl = tweet.mediaDetails?.[0]?.media_url_https || tweet.photos?.[0]?.url;
    if (mediaUrl) {
      mediaHtml = `<div style="display: flex; margin-top: 12px; border-radius: 16px; overflow: hidden;"><img src="${mediaUrl}" width="${width - 40}" height="280" style="object-fit: cover;" /></div>`;
    }
  }
  
  const dateHtml = hideDate ? '' : `<div style="display: flex; margin-top: 16px; font-size: 15px; color: ${colors.textSecondary};">${formatDate(tweet.created_at)}</div>`;
  
  return `
    <div style="display: flex; flex-direction: column; padding: ${padding}px; ${bgStyle} border-radius: ${borderRadius}px; width: ${width}px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; ${shadow}">
      <div style="display: flex; align-items: center; gap: 12px;">
        <img src="${profilePic}" style="width: 48px; height: 48px; border-radius: 50%;" />
        <div style="display: flex; flex-direction: column;">
          <div style="display: flex; align-items: center;">
            <span style="font-weight: 700; font-size: 15px; color: ${finalColors.text};">${userName}</span>
            ${verifiedBadge}
          </div>
          <span style="font-size: 15px; color: ${colors.textSecondary};">@${userHandle}</span>
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
      ${mediaHtml}
      ${dateHtml}
      ${metricsHtml}
    </div>
  `;
}

async function loadFonts() {
  const fonts = [];
  try {
    const regularUrl = 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff';
    const response = await fetch(regularUrl);
    if (response.ok) {
      fonts.push({ name: 'Inter', data: await response.arrayBuffer(), weight: 400, style: 'normal' });
    }
    const boldUrl = 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI2fAZ9hjp-Ek-_EeA.woff';
    const boldResponse = await fetch(boldUrl);
    if (boldResponse.ok) {
      fonts.push({ name: 'Inter', data: await boldResponse.arrayBuffer(), weight: 700, style: 'normal' });
    }
  } catch (e) {
    console.error('Font loading error:', e.message);
  }
  return fonts;
}

async function renderTweet(tweet, options = {}) {
  const {
    theme = 'dark',
    dimension = 'auto',
    format = 'png',
    scale = 1,
    ...styleOptions
  } = options;
  
  const width = DIMENSIONS[dimension]?.width || 550;
  
  // Pre-fetch images
  if (tweet.user?.profile_image_url_https) {
    const base64 = await fetchImageAsBase64(tweet.user.profile_image_url_https.replace('_normal', '_400x400'));
    if (base64) tweet.user.profile_image_url_https = base64;
  }
  if (tweet.mediaDetails?.[0]?.media_url_https) {
    const base64 = await fetchImageAsBase64(tweet.mediaDetails[0].media_url_https);
    if (base64) tweet.mediaDetails[0].media_url_https = base64;
  }
  
  const htmlContent = generateTweetHtml(tweet, theme, { width, ...styleOptions });
  const markup = html(htmlContent);
  const fonts = await loadFonts();
  
  const textLength = tweet.text?.length || 0;
  const hasMedia = !styleOptions.hideMedia && tweet.mediaDetails?.length > 0;
  const height = 200 + Math.ceil(textLength / 45) * 28 + (hasMedia ? 320 : 0) + (styleOptions.showMetrics !== false ? 60 : 0);
  
  const svg = await satori(markup, { width: width + 40, height, fonts });
  
  if (format === 'svg') {
    return { data: Buffer.from(svg), contentType: 'image/svg+xml', format: 'svg' };
  }
  
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: (width + 40) * scale } });
  const pngBuffer = resvg.render().asPng();
  
  return { data: pngBuffer, contentType: 'image/png', format: 'png' };
}

// ============================================================================
// EXPRESS APP
// ============================================================================

const app = express();

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// API Key authentication middleware
function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required', code: 'MISSING_API_KEY' });
  }
  
  const keyData = apiKeys[apiKey];
  if (!keyData || !keyData.active) {
    return res.status(401).json({ error: 'Invalid API key', code: 'INVALID_API_KEY' });
  }
  
  req.apiKey = apiKey;
  req.keyData = keyData;
  next();
}

// Rate limiting by tier
function createRateLimiter(tier) {
  const limits = CONFIG.rateLimits[tier] || CONFIG.rateLimits.free;
  return rateLimit({
    windowMs: limits.windowMs,
    max: limits.max,
    message: { error: 'Rate limit exceeded', code: 'RATE_LIMITED' },
    keyGenerator: (req) => req.apiKey,
  });
}

const rateLimiters = {
  free: createRateLimiter('free'),
  pro: createRateLimiter('pro'),
  business: createRateLimiter('business'),
};

function applyRateLimit(req, res, next) {
  const tier = req.keyData?.tier || 'free';
  const limiter = rateLimiters[tier] || rateLimiters.free;
  limiter(req, res, next);
}

// ============================================================================
// API ROUTES
// ============================================================================

// Health check (no auth)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Landing page
app.get('/', (req, res) => {
  // Serve landing page for browsers, JSON for API clients
  const acceptsHtml = req.headers.accept?.includes('text/html');
  
  if (acceptsHtml) {
    const landingPath = path.join(__dirname, 'landing.html');
    if (fs.existsSync(landingPath)) {
      return res.sendFile(landingPath);
    }
  }
  
  res.json({
    name: 'tweet-shots API',
    version: '1.0.0',
    description: 'Generate beautiful tweet screenshots',
    docs: '/docs',
    pricing: '/pricing',
    endpoints: {
      'GET /screenshot/:tweetId': 'Generate screenshot (returns image)',
      'POST /screenshot': 'Generate screenshot with options',
      'GET /tweet/:tweetId': 'Get tweet data as JSON',
    },
  });
});

// Documentation
app.get('/docs', (req, res) => {
  res.json({
    authentication: {
      description: 'Include API key in X-API-KEY header or apiKey query param',
      example: 'curl -H "X-API-KEY: your-key" https://api.example.com/screenshot/123',
    },
    endpoints: {
      'GET /screenshot/:tweetId': {
        description: 'Generate screenshot and return image',
        params: {
          tweetId: 'Tweet ID or full URL',
        },
        query: {
          theme: 'light|dark|dim|black (default: dark)',
          dimension: 'auto|instagramFeed|instagramStory|tiktok|linkedin|twitter|facebook|youtube',
          format: 'png|svg (default: png)',
          scale: '1|2|3 (default: 1)',
          gradient: 'sunset|ocean|forest|fire|midnight|sky|candy|peach',
          bgColor: 'Hex color (e.g., %23ff0000)',
          textColor: 'Hex color',
          linkColor: 'Hex color',
          hideMetrics: 'true|false',
          hideMedia: 'true|false',
          hideDate: 'true|false',
          hideVerified: 'true|false',
          hideShadow: 'true|false',
          padding: 'Number (default: 20)',
          radius: 'Number (default: 16)',
        },
      },
      'POST /screenshot': {
        description: 'Generate screenshot with JSON body',
        body: {
          tweetId: 'Required - Tweet ID or URL',
          theme: 'Optional',
          // ... same options as GET
          response: {
            type: 'image|base64|url (default: image)',
          },
        },
      },
    },
    rateLimits: CONFIG.rateLimits,
  });
});

// GET screenshot (returns image directly)
app.get('/screenshot/:tweetIdOrUrl', authenticate, applyRateLimit, async (req, res) => {
  try {
    const tweetId = extractTweetId(decodeURIComponent(req.params.tweetIdOrUrl));
    const tweet = await fetchTweet(tweetId);
    
    const options = {
      theme: req.query.theme || 'dark',
      dimension: req.query.dimension || 'auto',
      format: req.query.format || 'png',
      scale: parseInt(req.query.scale) || 1,
      backgroundGradient: req.query.gradient,
      backgroundColor: req.query.bgColor,
      textColor: req.query.textColor,
      linkColor: req.query.linkColor,
      showMetrics: req.query.hideMetrics !== 'true',
      hideMedia: req.query.hideMedia === 'true',
      hideDate: req.query.hideDate === 'true',
      hideVerified: req.query.hideVerified === 'true',
      hideShadow: req.query.hideShadow === 'true',
      padding: parseInt(req.query.padding) || 20,
      borderRadius: parseInt(req.query.radius) || 16,
    };
    
    const result = await renderTweet(tweet, options);
    
    trackUsage(req.apiKey);
    
    res.set('Content-Type', result.contentType);
    res.set('X-Tweet-ID', tweetId);
    res.set('X-Tweet-Author', tweet.user?.screen_name || 'unknown');
    res.send(result.data);
    
  } catch (error) {
    console.error('Screenshot error:', error.message);
    res.status(400).json({ error: error.message, code: 'SCREENSHOT_FAILED' });
  }
});

// POST screenshot (with JSON options)
app.post('/screenshot', authenticate, applyRateLimit, async (req, res) => {
  try {
    const { tweetId: rawId, tweetUrl, response: responseType = 'image', ...options } = req.body;
    
    const tweetId = extractTweetId(rawId || tweetUrl);
    const tweet = await fetchTweet(tweetId);
    
    const result = await renderTweet(tweet, {
      theme: options.theme || 'dark',
      dimension: options.dimension || 'auto',
      format: options.format || 'png',
      scale: options.scale || 1,
      backgroundGradient: options.gradient || options.backgroundGradient,
      backgroundColor: options.bgColor || options.backgroundColor,
      textColor: options.textColor,
      linkColor: options.linkColor,
      showMetrics: options.hideMetrics !== true && options.showMetrics !== false,
      hideMedia: options.hideMedia === true,
      hideDate: options.hideDate === true,
      hideVerified: options.hideVerified === true,
      hideShadow: options.hideShadow === true,
      padding: options.padding || 20,
      borderRadius: options.radius || options.borderRadius || 16,
    });
    
    trackUsage(req.apiKey);
    
    if (responseType === 'base64') {
      return res.json({
        success: true,
        tweetId,
        author: tweet.user?.screen_name,
        format: result.format,
        data: result.data.toString('base64'),
      });
    }
    
    if (responseType === 'url') {
      // Save to output directory and return URL
      if (!CONFIG.publicUrl) {
        return res.status(400).json({ error: 'URL response not configured', code: 'URL_NOT_CONFIGURED' });
      }
      
      const filename = `${tweetId}-${Date.now()}.${result.format}`;
      const filepath = path.join(CONFIG.outputDir, filename);
      
      if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
      }
      
      fs.writeFileSync(filepath, result.data);
      
      return res.json({
        success: true,
        tweetId,
        author: tweet.user?.screen_name,
        format: result.format,
        url: `${CONFIG.publicUrl}/${filename}`,
      });
    }
    
    // Default: return image
    res.set('Content-Type', result.contentType);
    res.send(result.data);
    
  } catch (error) {
    console.error('Screenshot error:', error.message);
    res.status(400).json({ error: error.message, code: 'SCREENSHOT_FAILED' });
  }
});

// GET tweet data
app.get('/tweet/:tweetIdOrUrl', authenticate, applyRateLimit, async (req, res) => {
  try {
    const tweetId = extractTweetId(decodeURIComponent(req.params.tweetIdOrUrl));
    const tweet = await fetchTweet(tweetId);
    
    trackUsage(req.apiKey);
    
    res.json({
      success: true,
      tweetId,
      data: tweet,
    });
    
  } catch (error) {
    res.status(400).json({ error: error.message, code: 'FETCH_FAILED' });
  }
});

// ============================================================================
// ADMIN ROUTES (for managing API keys)
// ============================================================================

const ADMIN_KEY = process.env.ADMIN_KEY || 'admin-secret-key';

function adminAuth(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: 'Admin access denied' });
  }
  next();
}

// Create API key
app.post('/admin/keys', adminAuth, (req, res) => {
  const { name, tier = 'free' } = req.body;
  
  const apiKey = `ts_${tier}_${uuidv4().replace(/-/g, '')}`;
  
  apiKeys[apiKey] = {
    name: name || 'Unnamed',
    tier,
    created: new Date().toISOString(),
    active: true,
  };
  
  saveJSON(CONFIG.apiKeysFile, apiKeys);
  
  res.json({ success: true, apiKey, tier, name });
});

// List API keys
app.get('/admin/keys', adminAuth, (req, res) => {
  const keys = Object.entries(apiKeys).map(([key, data]) => ({
    key: key.slice(0, 12) + '...',
    ...data,
    usage: usage[key] || { total: 0 },
  }));
  res.json({ keys });
});

// Revoke API key
app.delete('/admin/keys/:key', adminAuth, (req, res) => {
  const { key } = req.params;
  if (apiKeys[key]) {
    apiKeys[key].active = false;
    saveJSON(CONFIG.apiKeysFile, apiKeys);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Key not found' });
  }
});

// Usage stats
app.get('/admin/usage', adminAuth, (req, res) => {
  const stats = Object.entries(usage).map(([key, data]) => ({
    key: key.slice(0, 12) + '...',
    keyName: apiKeys[key]?.name,
    tier: apiKeys[key]?.tier,
    ...data,
  }));
  res.json({ stats });
});

// ============================================================================
// BILLING ROUTES (Stripe integration - requires STRIPE_SECRET_KEY)
// ============================================================================

// Pricing info (public)
app.get('/pricing', (req, res) => {
  res.json({
    plans: [
      { 
        tier: 'free', 
        price: 0, 
        credits: 50, 
        features: ['All 4 themes', 'PNG output', 'Basic dimensions', 'Community support'] 
      },
      { 
        tier: 'pro', 
        price: 9, 
        credits: 1000, 
        features: ['Everything in Free', 'SVG output', 'All gradients', 'Thread capture', 'AI translation', 'Priority support'] 
      },
      { 
        tier: 'business', 
        price: 49, 
        credits: 10000, 
        features: ['Everything in Pro', 'Custom branding', 'PDF export', 'Batch processing', 'Dedicated support', 'SLA guarantee'] 
      },
    ],
    currency: 'USD',
    billingCycle: 'monthly',
  });
});

// Free signup (get API key instantly)
app.post('/billing/signup', async (req, res) => {
  const { email, name } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }
  
  // Generate free tier API key
  const apiKey = `ts_free_${uuidv4().replace(/-/g, '').slice(0, 24)}`;
  
  apiKeys[apiKey] = {
    name: name || email,
    email,
    tier: 'free',
    created: new Date().toISOString(),
    active: true,
  };
  
  saveJSON(CONFIG.apiKeysFile, apiKeys);
  
  res.json({
    success: true,
    apiKey,
    tier: 'free',
    credits: 50,
    message: 'Your API key is ready! Save it somewhere safe.',
  });
});

// Usage stats for current key
app.get('/billing/usage', authenticate, (req, res) => {
  const keyData = req.keyData;
  const usageData = usage[req.apiKey] || { total: 0, monthly: {} };
  
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthlyUsage = usageData.monthly[monthKey] || 0;
  
  const limits = { free: 50, pro: 1000, business: 10000 };
  const limit = limits[keyData.tier] || 50;
  
  res.json({
    tier: keyData.tier,
    used: monthlyUsage,
    limit,
    remaining: Math.max(0, limit - monthlyUsage),
    total: usageData.total,
    resetDate: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
  });
});

// ============================================================================
// STATIC FILES (for URL response mode)
// ============================================================================

if (fs.existsSync(CONFIG.outputDir)) {
  app.use('/images', express.static(CONFIG.outputDir));
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(CONFIG.port, CONFIG.host, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    tweet-shots API                         ║
╠════════════════════════════════════════════════════════════╣
║  Server running at http://${CONFIG.host}:${CONFIG.port}                    ║
║                                                            ║
║  Endpoints:                                                ║
║    GET  /                    API info                      ║
║    GET  /docs                Documentation                 ║
║    GET  /health              Health check                  ║
║    GET  /screenshot/:id      Generate screenshot           ║
║    POST /screenshot          Generate with options         ║
║    GET  /tweet/:id           Get tweet data                ║
║                                                            ║
║  Admin (requires X-Admin-Key header):                      ║
║    POST   /admin/keys        Create API key                ║
║    GET    /admin/keys        List API keys                 ║
║    DELETE /admin/keys/:key   Revoke API key                ║
║    GET    /admin/usage       Usage statistics              ║
╚════════════════════════════════════════════════════════════╝
  `);
  
  // Create a default API key for testing if none exist
  if (Object.keys(apiKeys).length === 0) {
    const testKey = 'ts_free_test123';
    apiKeys[testKey] = { name: 'Test Key', tier: 'free', created: new Date().toISOString(), active: true };
    saveJSON(CONFIG.apiKeysFile, apiKeys);
    console.log(`\n  🔑 Test API key created: ${testKey}\n`);
  }
});

export default app;
