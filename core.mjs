/**
 * tweet-shots core library
 *
 * Shared rendering, fetching, and utility code used by both the CLI
 * (tweet-shots.mjs) and the API server (src/server.mjs).
 *
 * This module re-exports from focused sub-modules for backward compatibility.
 * Direct imports from the sub-modules are preferred for new code:
 *   - tweet-fetch.mjs  — extractTweetId, fetchTweet, fetchThread
 *   - tweet-html.mjs   — THEMES, GRADIENTS, generateTweetHtml, addLogoToHtml, formatDate, formatNumber
 *   - tweet-render.mjs — DIMENSIONS, renderTweetToImage, loadFonts, fetchImageAsBase64
 *   - tweet-utils.mjs  — translateText, processBatch, generatePDF
 */

// Tweet data fetching
export { extractTweetId, fetchTweet, fetchThread } from './tweet-fetch.mjs';

// HTML template generation
export { THEMES, GRADIENTS, formatDate, formatNumber, generateTweetHtml, addLogoToHtml } from './tweet-html.mjs';

// Rendering pipeline
export { DIMENSIONS, fetchImageAsBase64, loadFonts, renderTweetToImage, countMediaImages } from './tweet-render.mjs';

// CLI utilities
export { translateText, processBatch, generatePDF } from './tweet-utils.mjs';
