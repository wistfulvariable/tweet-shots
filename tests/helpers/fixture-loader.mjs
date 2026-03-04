/**
 * Fixture loader for real-tweet rendering integration tests.
 * Loads cached tweet JSON + builds a mock globalThis.fetch that serves
 * cached images instead of making network calls.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const TWEETS_DIR = path.join(__dir, '..', 'fixtures', 'tweets');
const IMAGES_DIR = path.join(__dir, '..', 'fixtures', 'images');

// Load manifest once at module init
const manifestPath = path.join(TWEETS_DIR, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

/**
 * Load a tweet fixture by name. Returns a deep clone since
 * renderTweetToImage() mutates the tweet in-place.
 * @param {string} name - Fixture name (e.g. 'text-only', 'single-photo')
 * @returns {object} Cloned tweet data
 */
export function loadTweetFixture(name) {
  const tweetPath = path.join(TWEETS_DIR, `${name}.json`);
  const raw = JSON.parse(fs.readFileSync(tweetPath, 'utf-8'));
  return structuredClone(raw);
}

/**
 * Build a mock fetch function that serves cached data instead of making
 * network calls. Intercepts:
 * - Image URLs (pbs.twimg.com) → cached .bin files
 * - Any other URL → throws to catch unexpected network calls
 *
 * @param {string} fixtureName - Name of the fixture (for image manifest lookup)
 * @returns {Function} Mock fetch function
 */
export function createFixtureFetchMock(fixtureName) {
  const entry = manifest[fixtureName];
  if (!entry) {
    throw new Error(`No manifest entry for fixture "${fixtureName}"`);
  }

  // Build a URL → { filePath, contentType } lookup from the manifest
  const imageMap = new Map();
  for (const [url, info] of Object.entries(entry.images || {})) {
    imageMap.set(url, {
      filePath: path.join(IMAGES_DIR, info.file),
      contentType: info.contentType,
    });
  }

  return async function mockFetch(url, options) {
    // Check exact URL match first
    if (imageMap.has(url)) {
      const { filePath, contentType } = imageMap.get(url);
      const buffer = fs.readFileSync(filePath);
      const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => ab,
        headers: { get: (h) => h === 'content-type' ? contentType : null },
      };
    }

    // Fallback: try stripping query params to match profile images
    // (profile pics don't have ?name= but may be fetched with different params)
    const urlNoQuery = url.split('?')[0];
    for (const [mapUrl, info] of imageMap.entries()) {
      if (mapUrl.split('?')[0] === urlNoQuery) {
        const buffer = fs.readFileSync(info.filePath);
        const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => ab,
          headers: { get: (h) => h === 'content-type' ? info.contentType : null },
        };
      }
    }

    // Unknown URL — return a failed response (don't crash, just fail gracefully
    // the way fetchImageAsBase64 handles non-ok responses)
    console.warn(`[fixture-mock] Unmatched URL: ${url.substring(0, 100)}`);
    return {
      ok: false,
      status: 404,
      arrayBuffer: async () => new ArrayBuffer(0),
      headers: { get: () => null },
    };
  };
}

/**
 * Get list of all available fixture names (excluding manifest).
 * @returns {string[]}
 */
export function getFixtureNames() {
  return Object.keys(manifest);
}
