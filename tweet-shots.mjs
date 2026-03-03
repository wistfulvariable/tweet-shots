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
  --scale <n>              Scale factor: 1, 2, or 3 (default: 1)
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
    width: null,
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
    // Advanced features
    batchFile: null,
    batchDir: '.',
    thread: false,
    threadPdf: false,
    translate: null,
    logo: null,
    logoPosition: 'bottom-right',
    logoSize: 40,
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
    } else if (arg === '--batch') {
      options.batchFile = args[++i];
    } else if (arg === '--batch-dir') {
      options.batchDir = args[++i];
    } else if (arg === '--thread') {
      options.thread = true;
    } else if (arg === '--thread-pdf') {
      options.thread = true;
      options.threadPdf = true;
    } else if (arg === '--translate') {
      options.translate = args[++i];
    } else if (arg === '--logo') {
      options.logo = args[++i];
    } else if (arg === '--logo-position') {
      options.logoPosition = args[++i];
    } else if (arg === '--logo-size') {
      options.logoSize = parseInt(args[++i], 10);
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

  const { width, showMetrics, format, jsonOnly, input, output, theme } = options;

  // Prepare render options
  const renderOpts = {
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
    logo: options.logo,
    logoPosition: options.logoPosition,
    logoSize: options.logoSize,
    translate: options.translate,
  };

  try {
    // =========== BATCH PROCESSING ===========
    if (options.batchFile) {
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
      return;
    }

    // =========== THREAD PROCESSING ===========
    if (options.thread && input) {
      const tweetId = extractTweetId(input);
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

        const result = await renderTweetToImage(tweet, renderOpts);
        images.push(result.data);

        if (!options.threadPdf || output?.endsWith('.png')) {
          const imgPath = output
            ? output.replace(/\.\w+$/, `-${i + 1}.png`)
            : `thread-${tweetId}-${i + 1}.png`;
          fs.writeFileSync(imgPath, result.data);
          console.log(`  ✓ Saved ${imgPath}`);
        }
      }

      if (options.threadPdf) {
        const pdfPath = output || `thread-${tweetId}.pdf`;
        console.log(`Generating PDF: ${pdfPath}`);
        await generatePDF(images, pdfPath, {
          title: `Thread by @${tweets[0]?.user?.screen_name}`,
          author: tweets[0]?.user?.name,
        });
        console.log(`✓ PDF saved to ${pdfPath}`);
      }

      return;
    }

    // =========== SINGLE TWEET ===========
    if (!input) {
      console.error('Error: No tweet URL or ID provided');
      printUsage();
      process.exit(1);
    }

    const tweetId = extractTweetId(input);
    console.log(`Fetching tweet ${tweetId}...`);

    let tweet = await fetchTweet(tweetId);

    if (jsonOnly) {
      console.log(JSON.stringify(tweet, null, 2));
      return;
    }

    if (options.translate) {
      console.log(`Translating to ${options.translate}...`);
      tweet.text = await translateText(tweet.text, options.translate);
    }

    console.log(`Tweet by @${tweet.user?.screen_name}: "${tweet.text?.substring(0, 50)}..."`);
    console.log(`Rendering with theme: ${theme}, dimension: ${options.dimension}`);

    const result = await renderTweetToImage(tweet, renderOpts);

    const ext = result.format;
    const outputPath = output || `tweet-${tweetId}.${ext}`;

    fs.writeFileSync(outputPath, result.data);
    console.log(`✓ Saved to ${outputPath}`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
