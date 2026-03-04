#!/usr/bin/env node
/**
 * One-time script to fetch real tweet data + images from Twitter's syndication API
 * and cache them as test fixtures for the rendering integration tests.
 *
 * Usage:
 *   node scripts/fetch-fixtures.mjs                  # Fetch all configured fixtures
 *   node scripts/fetch-fixtures.mjs --probe 123456   # Probe a tweet ID to see its content
 *
 * After fetching real tweets, the script creates "augmented" fixtures for content
 * types that the syndication API won't serve (links, quoted tweets, long text).
 * These use a real tweet as the base with hand-crafted additions for the specific feature.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..');
const TWEETS_DIR = path.join(ROOT, 'tests', 'fixtures', 'tweets');
const IMAGES_DIR = path.join(ROOT, 'tests', 'fixtures', 'images');

// ============================================================================
// TWEET ID → FIXTURE NAME MAPPING (confirmed available via syndication API)
// ============================================================================

const FIXTURES = [
  { name: 'text-only',       id: '20'                  },  // @jack "just setting up my twttr"
  { name: 'single-photo',    id: '266031293945503744'   },  // @BarackObama "Four more years" + photo
  { name: 'multi-photo',     id: '449660889793581056'   },  // @FLOTUS44 4-photo tweet
  { name: 'with-hashtags',   id: '440322224407314432'   },  // @TheEllenShow Oscar selfie #oscars
  { name: 'with-mentions',   id: '1674865731136020505'  },  // @elonmusk replying with @mention
  { name: 'photo-newlines',  id: '1349129669258448897'  },  // @elonmusk photo + newlines in text
  { name: 'video-tweet',     id: '1585341984679469056'  },  // @elonmusk "let that sink in" video
  { name: 'verified-user',   id: '1617979122625712128'  },  // @karpathy verified text tweet
  { name: 'unverified-user', id: '719484841172054016'   },  // @edent photo + mention, not verified
];

// ============================================================================
// HELPERS
// ============================================================================

function hashUrl(url) {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 16);
}

function highResProfileUrl(user) {
  return user?.profile_image_url_https?.replace('_normal', '_400x400') || '';
}

function twitterImageUrl(url, size) {
  if (!url || !size || !url.includes('pbs.twimg.com/media/')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}name=${size}`;
}

async function fetchTweetData(tweetId) {
  const token = Math.floor(Math.random() * 1000000);
  const url = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=${token}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for tweet ${tweetId}`);
  return res.json();
}

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  [WARN] Failed to download ${url.substring(0, 80)}: HTTP ${res.status}`);
    return null;
  }
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}

function classifyTweet(tweet) {
  const flags = [];
  if (!tweet.text) flags.push('NO_TEXT');
  if (tweet.text?.length > 200) flags.push('LONG_TEXT');
  if (tweet.text?.includes('\n')) flags.push('HAS_NEWLINES');
  if (tweet.mediaDetails?.length > 0) flags.push(`MEDIA(${tweet.mediaDetails.length})`);
  if (tweet.photos?.length > 0) flags.push(`PHOTOS(${tweet.photos.length})`);
  if (tweet.mediaDetails?.some(m => m.type === 'video')) flags.push('VIDEO');
  if (tweet.entities?.urls?.length > 0) flags.push(`URLS(${tweet.entities.urls.length})`);
  if (tweet.entities?.user_mentions?.length > 0) flags.push(`MENTIONS(${tweet.entities.user_mentions.length})`);
  if (tweet.entities?.hashtags?.length > 0) flags.push(`HASHTAGS(${tweet.entities.hashtags.length})`);
  if (tweet.quoted_tweet) flags.push('QUOTED');
  if (tweet.quoted_tweet?.mediaDetails?.length > 0) flags.push('QUOTED_MEDIA');
  if (tweet.user?.is_blue_verified) flags.push('VERIFIED');
  if (tweet.parent) flags.push('HAS_PARENT');
  return flags;
}

// ============================================================================
// IMAGE EXTRACTION — mirrors preFetchAllImages() in tweet-render.mjs
// ============================================================================

function extractImageUrls(tweet) {
  const urls = [];

  const profileUrl = highResProfileUrl(tweet.user);
  if (profileUrl) urls.push(profileUrl);

  for (const media of (tweet.mediaDetails || [])) {
    if (media.media_url_https) {
      urls.push(twitterImageUrl(media.media_url_https, 'small'));
      urls.push(twitterImageUrl(media.media_url_https, 'medium'));
    }
  }
  for (const photo of (tweet.photos || [])) {
    if (photo.url) {
      urls.push(twitterImageUrl(photo.url, 'small'));
      urls.push(twitterImageUrl(photo.url, 'medium'));
    }
  }

  if (tweet.quoted_tweet) {
    const qt = tweet.quoted_tweet;
    const qtProfile = highResProfileUrl(qt.user);
    if (qtProfile) urls.push(qtProfile);
    if (qt.mediaDetails?.[0]?.media_url_https) {
      urls.push(twitterImageUrl(qt.mediaDetails[0].media_url_https, 'small'));
      urls.push(twitterImageUrl(qt.mediaDetails[0].media_url_https, 'medium'));
    }
    if (qt.photos?.[0]?.url) {
      urls.push(twitterImageUrl(qt.photos[0].url, 'small'));
      urls.push(twitterImageUrl(qt.photos[0].url, 'medium'));
    }
  }

  return [...new Set(urls)];
}

// ============================================================================
// AUGMENTED FIXTURES
// Syndication API won't serve tweets with external links, quoted tweets, or
// long text (200+ chars). These fixtures use a real tweet as the base with
// hand-crafted additions for the specific feature being tested.
// ============================================================================

function createAugmentedFixtures(manifest) {
  console.log('\n--- Creating augmented fixtures ---');

  // Base: use the Karpathy tweet (simple, verified, clean text)
  const basePath = path.join(TWEETS_DIR, 'verified-user.json');
  if (!fs.existsSync(basePath)) {
    console.warn('  [SKIP] Base tweet (verified-user) not available for augmentation');
    return;
  }
  const base = JSON.parse(fs.readFileSync(basePath, 'utf-8'));

  // 1. with-links: Add external URL entities
  const withLinks = structuredClone(base);
  withLinks.text = 'Check out this article about the future of AI https://t.co/abc123example';
  withLinks.entities = {
    ...withLinks.entities,
    urls: [{
      url: 'https://t.co/abc123example',
      display_url: 'example.com/future-of-ai',
      expanded_url: 'https://example.com/future-of-ai',
      indices: [46, 70],
    }],
  };
  fs.writeFileSync(path.join(TWEETS_DIR, 'with-links.json'), JSON.stringify(withLinks, null, 2));
  manifest['with-links'] = { tweetId: 'augmented-from-' + base.id_str, flags: ['URLS(1)', 'AUGMENTED'], images: manifest['verified-user']?.images || {} };
  console.log('  [OK] with-links.json (augmented from verified-user)');

  // 2. quoted-text: Add a quoted tweet (text only)
  const quotedText = structuredClone(base);
  quotedText.text = 'This is a great point about programming languages';
  quotedText.quoted_tweet = {
    id_str: '9999999999',
    text: 'The best code is no code at all. Every new line of code you willingly bring into the world is code that has to be debugged.',
    user: {
      name: 'Jeff Atwood',
      screen_name: 'codinghorror',
      profile_image_url_https: base.user.profile_image_url_https, // reuse base profile pic
      is_blue_verified: false,
    },
    created_at: '2023-06-15T10:30:00.000Z',
    entities: { urls: [], user_mentions: [], hashtags: [] },
    mediaDetails: [],
    photos: [],
  };
  fs.writeFileSync(path.join(TWEETS_DIR, 'quoted-text.json'), JSON.stringify(quotedText, null, 2));
  manifest['quoted-text'] = { tweetId: 'augmented-from-' + base.id_str, flags: ['QUOTED', 'AUGMENTED'], images: manifest['verified-user']?.images || {} };
  console.log('  [OK] quoted-text.json (augmented from verified-user)');

  // 3. quoted-media: Add a quoted tweet with media
  // Use the Obama photo tweet as quoted content (reuses its cached images)
  const obamaPath = path.join(TWEETS_DIR, 'single-photo.json');
  const quotedMedia = structuredClone(base);
  quotedMedia.text = 'One of the most iconic moments in social media history';
  if (fs.existsSync(obamaPath)) {
    const obama = JSON.parse(fs.readFileSync(obamaPath, 'utf-8'));
    quotedMedia.quoted_tweet = {
      id_str: obama.id_str,
      text: obama.text,
      user: obama.user,
      created_at: obama.created_at,
      entities: obama.entities || { urls: [], user_mentions: [], hashtags: [] },
      mediaDetails: obama.mediaDetails || [],
      photos: obama.photos || [],
    };
    // Merge image manifests so the mock can serve quote tweet images too
    const mergedImages = { ...(manifest['verified-user']?.images || {}), ...(manifest['single-photo']?.images || {}) };
    manifest['quoted-media'] = { tweetId: 'augmented-from-' + base.id_str, flags: ['QUOTED', 'QUOTED_MEDIA', 'AUGMENTED'], images: mergedImages };
  } else {
    quotedMedia.quoted_tweet = structuredClone(quotedText.quoted_tweet);
    manifest['quoted-media'] = { tweetId: 'augmented-from-' + base.id_str, flags: ['QUOTED', 'AUGMENTED'], images: manifest['verified-user']?.images || {} };
  }
  fs.writeFileSync(path.join(TWEETS_DIR, 'quoted-media.json'), JSON.stringify(quotedMedia, null, 2));
  console.log('  [OK] quoted-media.json (augmented from verified-user + single-photo)');

  // 4. long-text: Extend text to 250+ chars with newlines
  const longText = structuredClone(base);
  longText.text = [
    'After mass adoption of LLMs in 2024-2025, the landscape of software engineering has fundamentally changed.',
    '',
    'The key insight: natural language is becoming a first-class programming interface.',
    '',
    'This has profound implications for how we think about abstraction layers in computing.',
  ].join('\n');
  fs.writeFileSync(path.join(TWEETS_DIR, 'long-text.json'), JSON.stringify(longText, null, 2));
  manifest['long-text'] = { tweetId: 'augmented-from-' + base.id_str, flags: ['LONG_TEXT', 'HAS_NEWLINES', 'AUGMENTED'], images: manifest['verified-user']?.images || {} };
  console.log('  [OK] long-text.json (augmented from verified-user)');
}

// ============================================================================
// PROBE MODE
// ============================================================================

async function probe(tweetId) {
  console.log(`\nProbing tweet ${tweetId}...`);
  const tweet = await fetchTweetData(tweetId);
  const flags = classifyTweet(tweet);

  console.log(`\n  User: @${tweet.user?.screen_name} (${tweet.user?.name})`);
  console.log(`  Text: "${tweet.text?.substring(0, 120)}${tweet.text?.length > 120 ? '...' : ''}"`);
  console.log(`  Text length: ${tweet.text?.length}`);
  console.log(`  Flags: ${flags.join(', ')}`);
  console.log(`  Images to download: ${extractImageUrls(tweet).length}`);
  console.log(`  Engagement: ${tweet.favorite_count || 0} likes, ${tweet.retweet_count || 0} RTs`);
  console.log();
}

// ============================================================================
// MAIN FETCH
// ============================================================================

async function fetchAll() {
  fs.mkdirSync(TWEETS_DIR, { recursive: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const manifest = {};
  let successCount = 0;
  let failCount = 0;

  for (const fixture of FIXTURES) {
    console.log(`\n[${fixture.name}] Fetching tweet ${fixture.id}...`);

    let tweet;
    try {
      tweet = await fetchTweetData(fixture.id);
    } catch (err) {
      console.error(`  [FAIL] ${err.message}`);
      failCount++;
      continue;
    }

    const flags = classifyTweet(tweet);
    console.log(`  @${tweet.user?.screen_name}: "${tweet.text?.substring(0, 80)}..."`);
    console.log(`  Flags: ${flags.join(', ')}`);

    // Save tweet JSON
    const tweetPath = path.join(TWEETS_DIR, `${fixture.name}.json`);
    fs.writeFileSync(tweetPath, JSON.stringify(tweet, null, 2));
    console.log(`  Saved tweet JSON -> ${fixture.name}.json`);

    // Extract and download images
    const imageUrls = extractImageUrls(tweet);
    const imageManifest = {};

    for (const url of imageUrls) {
      const hash = hashUrl(url);
      const filePath = path.join(IMAGES_DIR, `${hash}.bin`);

      if (fs.existsSync(filePath)) {
        imageManifest[url] = { file: `${hash}.bin`, contentType: 'image/jpeg' };
        console.log(`  [CACHED] ${url.substring(0, 70)}...`);
        continue;
      }

      const result = await downloadImage(url);
      if (result) {
        fs.writeFileSync(filePath, result.buffer);
        imageManifest[url] = { file: `${hash}.bin`, contentType: result.contentType };
        console.log(`  [OK] ${url.substring(0, 70)}... (${(result.buffer.length / 1024).toFixed(1)}KB)`);
      }
    }

    manifest[fixture.name] = {
      tweetId: fixture.id,
      flags,
      images: imageManifest,
    };

    successCount++;
    await new Promise(r => setTimeout(r, 1000));
  }

  // Create augmented fixtures for content types unavailable via syndication API
  createAugmentedFixtures(manifest);

  // Save manifest
  const manifestPath = path.join(TWEETS_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest saved to tests/fixtures/tweets/manifest.json`);
  console.log(`\nDone: ${successCount} real tweets fetched (${failCount} failed), + 4 augmented fixtures`);
}

// ============================================================================
// CLI
// ============================================================================

const args = process.argv.slice(2);

if (args[0] === '--probe' && args[1]) {
  probe(args[1]).catch(err => {
    console.error(`Probe failed: ${err.message}`);
    process.exit(1);
  });
} else {
  fetchAll().catch(err => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}
