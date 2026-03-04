#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import {
  extractTweetId,
  fetchTweet,
  fetchThread,
  translateText,
  processBatch,
  generatePDF,
  renderTweetToImage,
  DIMENSIONS,
} from './core.mjs';

// ============================================================================
// CLI
// ============================================================================

function printUsage() {
  console.log(`
tweet-shots - Generate beautiful tweet screenshots

Usage:
  tweet-shots <tweet-url-or-id> [options]
  tweet-shots --batch <file>    Process multiple URLs from file
  tweet-shots --thread <url>    Capture entire thread

Basic Options:
  -o, --output <file>      Output file path (default: tweet-<id>.png)
  -t, --theme <theme>      Theme: light, dark, dim, black (default: dark)
  -d, --dimension <preset> Dimension preset (default: auto)
  -w, --width <px>         Width in pixels (default: 550, overrides dimension)
  --svg                    Output SVG instead of PNG
  -j, --json               Output tweet JSON data
  --scale <n>              Scale factor: 1, 2, or 3 (default: 2)
  -h, --help               Show this help

Advanced Features:
  --batch <file>           Process multiple URLs (one per line)
  --batch-dir <dir>        Output directory for batch (default: .)
  --thread                 Capture entire thread as multiple images
  --thread-pdf             Export thread as single PDF
  --translate <lang>       Translate tweet text (requires OPENAI_API_KEY)
  --logo <url>             Add logo/watermark to image
  --logo-position <pos>    Logo position: top-left, top-right, bottom-left, bottom-right
  --logo-size <px>         Logo size in pixels (default: 40)

Hide/Show Options:
  --no-metrics             Hide engagement metrics
  --no-media               Hide images/videos
  --no-verified            Hide verified badge
  --no-date                Hide timestamp
  --no-quote               Hide quote tweet
  --no-shadow              Hide shadow effect
  --show-url               Show tweet URL at bottom of image

Styling Options:
  --bg-color <hex>         Background color (e.g., #ff0000)
  --bg-gradient <name>     Gradient: sunset, ocean, forest, fire, midnight, sky, candy, peach
  --bg-image <url>         Background image URL
  --text-color <hex>       Primary text color
  --link-color <hex>       Link/mention color
  --padding <px>           Padding around tweet (default: 20)
  --radius <px>            Border radius (default: 16)
  --font-family <name>     Custom font family name (e.g., Roboto)
  --font-url <url>         URL to custom font file (.ttf, .woff, .otf)
  --font-bold-url <url>    URL to custom bold font file (optional)

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

Translation Languages:
  en, es, fr, de, it, pt, zh, ja, ko, ar, hi, ru, etc.

Examples:
  # Basic usage
  tweet-shots https://x.com/karpathy/status/1617979122625712128

  # Instagram-ready with gradient
  tweet-shots <url> -d instagramFeed --bg-gradient ocean

  # Batch process from file
  tweet-shots --batch urls.txt --batch-dir ./output -t dark

  # Capture thread as PDF
  tweet-shots --thread <url> --thread-pdf -o thread.pdf

  # Translate to Spanish with branding
  tweet-shots <url> --translate es --logo https://example.com/logo.png

  # Minimal style for quotes
  tweet-shots <url> --no-metrics --no-date --no-shadow
`);
}

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

/** Parse CLI arguments into a structured options object. */
function parseArgs(args) {
  const options = {
    input: null,
    output: null,
    theme: 'dark',
    dimension: 'auto',
    width: null,
    format: 'png',
    jsonOnly: false,
    scale: 2,
    // Hide/show
    showMetrics: true,
    hideMedia: false,
    hideVerified: false,
    hideDate: false,
    hideQuoteTweet: false,
    hideShadow: false,
    showUrl: false,
    // Styling
    backgroundColor: null,
    backgroundGradient: null,
    backgroundImage: null,
    textColor: null,
    linkColor: null,
    padding: 20,
    borderRadius: 16,
    // Advanced features
    batchFile: null,
    batchDir: '.',
    thread: false,
    threadPdf: false,
    translate: null,
    logo: null,
    logoPosition: 'bottom-right',
    logoSize: 40,
    // Custom fonts
    fontFamily: null,
    fontUrl: null,
    fontBoldUrl: null,
  };

  // Map of flags to their handler: [key, transform?]
  const valueFlags = {
    '-o': 'output', '--output': 'output',
    '-t': 'theme', '--theme': 'theme',
    '-d': 'dimension', '--dimension': 'dimension',
    '--bg-color': 'backgroundColor',
    '--bg-gradient': 'backgroundGradient',
    '--bg-image': 'backgroundImage',
    '--text-color': 'textColor',
    '--link-color': 'linkColor',
    '--font-family': 'fontFamily',
    '--font-url': 'fontUrl',
    '--font-bold-url': 'fontBoldUrl',
    '--batch': 'batchFile',
    '--batch-dir': 'batchDir',
    '--translate': 'translate',
    '--logo': 'logo',
    '--logo-position': 'logoPosition',
  };

  const intFlags = {
    '-w': 'width', '--width': 'width',
    '--scale': 'scale',
    '--padding': 'padding',
    '--radius': 'borderRadius',
    '--logo-size': 'logoSize',
  };

  const boolFlags = {
    '--no-metrics': ['showMetrics', false],
    '--no-media': ['hideMedia', true],
    '--no-verified': ['hideVerified', true],
    '--no-date': ['hideDate', true],
    '--no-quote': ['hideQuoteTweet', true],
    '--no-shadow': ['hideShadow', true],
    '--show-url': ['showUrl', true],
    '--svg': ['format', 'svg'],
    '-j': ['jsonOnly', true], '--json': ['jsonOnly', true],
    '--thread': ['thread', true],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (valueFlags[arg]) {
      options[valueFlags[arg]] = args[++i];
    } else if (intFlags[arg]) {
      options[intFlags[arg]] = parseInt(args[++i], 10);
    } else if (boolFlags[arg]) {
      const [key, value] = boolFlags[arg];
      options[key] = value;
    } else if (arg === '--thread-pdf') {
      options.thread = true;
      options.threadPdf = true;
    } else if (!arg.startsWith('-')) {
      options.input = arg;
    }
  }

  // Apply dimension preset
  const dim = DIMENSIONS[options.dimension];
  if (dim?.height) {
    // Fixed-dimension preset: card stays readable, preset sets canvas size
    options.canvasWidth = dim.width;
    options.canvasHeight = dim.height;
    if (!options.width) options.width = 550; // readable card width
  } else if (!options.width) {
    options.width = dim?.width || 550;
  }

  return options;
}

/** Extract renderer-specific options from parsed CLI options. */
function buildRenderOptions(options) {
  return {
    theme: options.theme,
    width: options.width,
    showMetrics: options.showMetrics,
    format: options.format,
    scale: options.scale,
    hideMedia: options.hideMedia,
    hideVerified: options.hideVerified,
    hideDate: options.hideDate,
    hideQuoteTweet: options.hideQuoteTweet,
    hideShadow: options.hideShadow,
    showUrl: options.showUrl,
    backgroundColor: options.backgroundColor,
    backgroundGradient: options.backgroundGradient,
    backgroundImage: options.backgroundImage,
    textColor: options.textColor,
    linkColor: options.linkColor,
    padding: options.padding,
    borderRadius: options.borderRadius,
    logo: options.logo,
    logoPosition: options.logoPosition,
    logoSize: options.logoSize,
    translate: options.translate,
    fontFamily: options.fontFamily,
    fontUrl: options.fontUrl,
    fontBoldUrl: options.fontBoldUrl,
    canvasWidth: options.canvasWidth || null,
    canvasHeight: options.canvasHeight || null,
  };
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleBatch(options, renderOpts) {
  console.log(`Batch processing from ${options.batchFile}...`);

  if (!fs.existsSync(options.batchFile)) {
    throw new Error(`Batch file not found: ${options.batchFile}`);
  }

  const urls = fs.readFileSync(options.batchFile, 'utf-8').split('\n').filter(l => l.trim());
  console.log(`Found ${urls.length} URLs to process`);

  if (options.batchDir !== '.' && !fs.existsSync(options.batchDir)) {
    fs.mkdirSync(options.batchDir, { recursive: true });
  }

  const results = await processBatch(urls, renderOpts, options.batchDir);

  const successful = results.filter(r => r.success).length;
  console.log(`\n✓ Batch complete: ${successful}/${results.length} succeeded`);
}

async function handleThread(options, renderOpts) {
  const tweetId = extractTweetId(options.input);
  console.log(`Fetching thread starting from ${tweetId}...`);

  const tweets = await fetchThread(tweetId);
  console.log(`Found ${tweets.length} tweets in thread`);

  const images = [];

  for (let i = 0; i < tweets.length; i++) {
    let tweet = tweets[i];
    console.log(`[${i + 1}/${tweets.length}] Rendering tweet...`);

    if (options.translate) {
      console.log(`  Translating to ${options.translate}...`);
      tweet.text = await translateText(tweet.text, options.translate);
    }

    const threadTweetId = tweet.id_str || tweetId;
    const result = await renderTweetToImage(tweet, { ...renderOpts, tweetId: threadTweetId });
    images.push(result.data);

    if (!options.threadPdf || options.output?.endsWith('.png')) {
      const imgPath = options.output
        ? options.output.replace(/\.\w+$/, `-${i + 1}.png`)
        : `thread-${tweetId}-${i + 1}.png`;
      fs.writeFileSync(imgPath, result.data);
      console.log(`  ✓ Saved ${imgPath}`);
    }
  }

  if (options.threadPdf) {
    const pdfPath = options.output || `thread-${tweetId}.pdf`;
    console.log(`Generating PDF: ${pdfPath}`);
    await generatePDF(images, pdfPath, {
      title: `Thread by @${tweets[0]?.user?.screen_name}`,
      author: tweets[0]?.user?.name,
    });
    console.log(`✓ PDF saved to ${pdfPath}`);
  }
}

async function handleSingle(options, renderOpts) {
  if (!options.input) {
    console.error('Error: No tweet URL or ID provided');
    printUsage();
    process.exit(1);
  }

  const tweetId = extractTweetId(options.input);
  console.log(`Fetching tweet ${tweetId}...`);

  let tweet = await fetchTweet(tweetId);

  if (options.jsonOnly) {
    console.log(JSON.stringify(tweet, null, 2));
    return;
  }

  if (options.translate) {
    console.log(`Translating to ${options.translate}...`);
    tweet.text = await translateText(tweet.text, options.translate);
  }

  console.log(`Tweet by @${tweet.user?.screen_name}: "${tweet.text?.substring(0, 50)}..."`);
  console.log(`Rendering with theme: ${options.theme}, dimension: ${options.dimension}`);

  const result = await renderTweetToImage(tweet, { ...renderOpts, tweetId });

  const ext = result.format;
  const outputPath = options.output || `tweet-${tweetId}.${ext}`;

  fs.writeFileSync(outputPath, result.data);
  console.log(`✓ Saved to ${outputPath}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  const options = parseArgs(args);
  const renderOpts = buildRenderOptions(options);

  try {
    if (options.batchFile) return handleBatch(options, renderOpts);
    if (options.thread && options.input) return handleThread(options, renderOpts);
    return handleSingle(options, renderOpts);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
