/**
 * CLI-only utilities — translation, batch processing, and PDF generation.
 * These functions are used by the CLI (tweet-shots.mjs) but not by the API server.
 */

import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { extractTweetId, fetchTweet } from './tweet-fetch.mjs';
import { renderTweetToImage } from './tweet-render.mjs';

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
