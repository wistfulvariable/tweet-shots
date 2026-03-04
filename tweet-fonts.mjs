/**
 * Multilingual font loading for Satori — lazily loads Noto Sans
 * font files from bundled fonts/ directory when non-Latin scripts
 * are detected.
 *
 * Used by loadAdditionalAsset in tweet-render.mjs when Satori
 * encounters text in scripts that Inter font cannot render.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// CONFIGURATION
// ============================================================================

const __dir = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.join(__dir, 'fonts');

/**
 * Mapping from Satori language codes to Noto Sans font files.
 * Satori's Locale type defines these exact language codes.
 */
const LANGUAGE_FONT_MAP = {
  'ja-JP':      { file: 'NotoSansJP-Regular.ttf',         name: 'Noto Sans JP' },
  'ko-KR':      { file: 'NotoSansKR-Regular.ttf',         name: 'Noto Sans KR' },
  'zh-CN':      { file: 'NotoSansSC-Regular.ttf',         name: 'Noto Sans SC' },
  'zh-TW':      { file: 'NotoSansTC-Regular.ttf',         name: 'Noto Sans TC' },
  'zh-HK':      { file: 'NotoSansTC-Regular.ttf',         name: 'Noto Sans TC' },
  'th-TH':      { file: 'NotoSansThai-Regular.ttf',       name: 'Noto Sans Thai' },
  'bn-IN':      { file: 'NotoSansBengali-Regular.ttf',    name: 'Noto Sans Bengali' },
  'ar-AR':      { file: 'NotoSansArabic-Regular.ttf',     name: 'Noto Sans Arabic' },
  'ta-IN':      { file: 'NotoSansTamil-Regular.ttf',      name: 'Noto Sans Tamil' },
  'ml-IN':      { file: 'NotoSansMalayalam-Regular.ttf',  name: 'Noto Sans Malayalam' },
  'he-IL':      { file: 'NotoSansHebrew-Regular.ttf',     name: 'Noto Sans Hebrew' },
  'te-IN':      { file: 'NotoSansTelugu-Regular.ttf',     name: 'Noto Sans Telugu' },
  'devanagari': { file: 'NotoSansDevanagari-Regular.ttf',  name: 'Noto Sans Devanagari' },
  'kannada':    { file: 'NotoSansKannada-Regular.ttf',    name: 'Noto Sans Kannada' },
};

// ============================================================================
// MODULE-LEVEL CACHE
// ============================================================================

// Map<string, Array<FontOptions>> — language code → loaded font array
const _fontCache = new Map();

// ============================================================================
// FONT LOADING
// ============================================================================

/**
 * Load a Noto Sans font file for the given Satori language code.
 * Returns an Array<FontOptions> suitable for Satori's loadAdditionalAsset.
 * Cached after first load per language code.
 *
 * @param {string} languageCode - Satori language code (e.g. 'ja-JP')
 * @returns {Array<{name: string, data: ArrayBuffer, weight: number, style: string, lang: string}>|undefined}
 */
export function loadLanguageFont(languageCode) {
  if (_fontCache.has(languageCode)) {
    return _fontCache.get(languageCode);
  }

  const mapping = LANGUAGE_FONT_MAP[languageCode];
  if (!mapping) return undefined;

  const filePath = path.join(FONTS_DIR, mapping.file);

  try {
    if (!fs.existsSync(filePath)) {
      console.error(`Multilingual font missing: ${mapping.file} for ${languageCode}`);
      return undefined;
    }

    const buf = fs.readFileSync(filePath);
    // Copy to new ArrayBuffer (Node Buffer.buffer may be shared pool)
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);

    const fontOptions = [{
      name: mapping.name,
      data: ab,
      weight: 400,
      style: 'normal',
      lang: languageCode,
    }];

    _fontCache.set(languageCode, fontOptions);
    return fontOptions;
  } catch (e) {
    console.error(`Failed to load font ${mapping.file} for ${languageCode}: ${e.message}`);
    return undefined;
  }
}

/** Get the set of supported language codes. */
export function getSupportedLanguages() {
  return Object.keys(LANGUAGE_FONT_MAP);
}

/** Clear the font cache (for testing). */
export function clearFontCache() {
  _fontCache.clear();
}
