/**
 * Unit tests for tweet-fonts.mjs — multilingual font lazy loading.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock fs to control font file presence/absence
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => {
        // Return a fake font buffer (128 bytes with OTF-like header)
        const buf = Buffer.alloc(128);
        buf[0] = 0x00; buf[1] = 0x01; buf[2] = 0x00; buf[3] = 0x00;
        return buf;
      }),
    },
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => {
      const buf = Buffer.alloc(128);
      buf[0] = 0x00; buf[1] = 0x01; buf[2] = 0x00; buf[3] = 0x00;
      return buf;
    }),
  };
});

import fs from 'fs';
import { loadLanguageFont, getSupportedLanguages, clearFontCache } from '../../tweet-fonts.mjs';

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearFontCache();
  vi.clearAllMocks();
  // Restore default mock implementations
  fs.existsSync.mockReturnValue(true);
  fs.readFileSync.mockReturnValue((() => {
    const buf = Buffer.alloc(128);
    buf[0] = 0x00; buf[1] = 0x01; buf[2] = 0x00; buf[3] = 0x00;
    return buf;
  })());
});

// ─── loadLanguageFont ────────────────────────────────────────────────────────

describe('loadLanguageFont', () => {
  it('returns FontOptions array for ja-JP', () => {
    const result = loadLanguageFont('ja-JP');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'Noto Sans JP',
      weight: 400,
      style: 'normal',
      lang: 'ja-JP',
    });
    expect(result[0].data).toBeInstanceOf(ArrayBuffer);
  });

  it('returns FontOptions array for ko-KR', () => {
    const result = loadLanguageFont('ko-KR');
    expect(result[0]).toMatchObject({
      name: 'Noto Sans KR',
      lang: 'ko-KR',
    });
  });

  it('returns FontOptions array for zh-CN', () => {
    const result = loadLanguageFont('zh-CN');
    expect(result[0]).toMatchObject({
      name: 'Noto Sans SC',
      lang: 'zh-CN',
    });
  });

  it('returns FontOptions array for zh-TW', () => {
    const result = loadLanguageFont('zh-TW');
    expect(result[0]).toMatchObject({
      name: 'Noto Sans TC',
      lang: 'zh-TW',
    });
  });

  it('returns FontOptions array for th-TH', () => {
    const result = loadLanguageFont('th-TH');
    expect(result[0]).toMatchObject({
      name: 'Noto Sans Thai',
      lang: 'th-TH',
    });
  });

  it('returns FontOptions array for ar-AR', () => {
    const result = loadLanguageFont('ar-AR');
    expect(result[0]).toMatchObject({
      name: 'Noto Sans Arabic',
      lang: 'ar-AR',
    });
  });

  it('returns FontOptions array for he-IL', () => {
    const result = loadLanguageFont('he-IL');
    expect(result[0]).toMatchObject({
      name: 'Noto Sans Hebrew',
      lang: 'he-IL',
    });
  });

  it('returns FontOptions array for devanagari', () => {
    const result = loadLanguageFont('devanagari');
    expect(result[0]).toMatchObject({
      name: 'Noto Sans Devanagari',
      lang: 'devanagari',
    });
  });

  it('returns undefined for unknown language code', () => {
    const result = loadLanguageFont('xx-XX');
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    const result = loadLanguageFont('');
    expect(result).toBeUndefined();
  });

  it('caches font data after first load (same reference returned)', () => {
    const first = loadLanguageFont('th-TH');
    const second = loadLanguageFont('th-TH');
    expect(first).toBe(second); // Same object reference = cached
    // readFileSync called only once for th-TH
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
  });

  it('loads different fonts for different language codes', () => {
    const jp = loadLanguageFont('ja-JP');
    const kr = loadLanguageFont('ko-KR');
    expect(jp[0].name).toBe('Noto Sans JP');
    expect(kr[0].name).toBe('Noto Sans KR');
    expect(jp).not.toBe(kr);
  });

  it('zh-TW and zh-HK both use Noto Sans TC', () => {
    const tw = loadLanguageFont('zh-TW');
    const hk = loadLanguageFont('zh-HK');
    expect(tw[0].name).toBe('Noto Sans TC');
    expect(hk[0].name).toBe('Noto Sans TC');
  });

  it('returns undefined when font file does not exist on disk', () => {
    fs.existsSync.mockReturnValueOnce(false);
    const result = loadLanguageFont('ar-AR');
    expect(result).toBeUndefined();
  });

  it('returns undefined when readFileSync throws', () => {
    fs.readFileSync.mockImplementationOnce(() => { throw new Error('ENOENT'); });
    const result = loadLanguageFont('he-IL');
    expect(result).toBeUndefined();
  });

  it('font data ArrayBuffer is a proper copy (correct size)', () => {
    const result = loadLanguageFont('bn-IN');
    expect(result[0].data.byteLength).toBe(128);
  });

  it('font data ArrayBuffer contains the original bytes', () => {
    const result = loadLanguageFont('ta-IN');
    const view = new Uint8Array(result[0].data);
    // First 4 bytes should be OTF header from our mock
    expect(view[0]).toBe(0x00);
    expect(view[1]).toBe(0x01);
    expect(view[2]).toBe(0x00);
    expect(view[3]).toBe(0x00);
  });

  it('all font entries have weight 400 and style normal', () => {
    const codes = ['ja-JP', 'ko-KR', 'zh-CN', 'th-TH', 'ar-AR', 'he-IL', 'devanagari'];
    for (const code of codes) {
      clearFontCache();
      const result = loadLanguageFont(code);
      expect(result[0].weight).toBe(400);
      expect(result[0].style).toBe('normal');
    }
  });
});

// ─── getSupportedLanguages ───────────────────────────────────────────────────

describe('getSupportedLanguages', () => {
  it('returns all 14 supported language codes', () => {
    const langs = getSupportedLanguages();
    expect(langs).toHaveLength(14);
  });

  it('includes all Satori locale codes', () => {
    const langs = getSupportedLanguages();
    const expected = [
      'ja-JP', 'ko-KR', 'zh-CN', 'zh-TW', 'zh-HK',
      'th-TH', 'bn-IN', 'ar-AR', 'ta-IN', 'ml-IN',
      'he-IL', 'te-IN', 'devanagari', 'kannada',
    ];
    for (const code of expected) {
      expect(langs).toContain(code);
    }
  });

  it('returns an array of strings', () => {
    const langs = getSupportedLanguages();
    for (const lang of langs) {
      expect(typeof lang).toBe('string');
    }
  });
});

// ─── clearFontCache ──────────────────────────────────────────────────────────

describe('clearFontCache', () => {
  it('clears cached fonts so next load reads from disk again', () => {
    loadLanguageFont('ja-JP');
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);

    clearFontCache();

    loadLanguageFont('ja-JP');
    expect(fs.readFileSync).toHaveBeenCalledTimes(2); // Read again after cache clear
  });
});
