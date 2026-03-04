/**
 * Unit tests for tweet-emoji.mjs — emoji codepoint conversion and CDN fetching.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { emojiToCodepoint, fetchEmoji, clearEmojiCache, getEmojiCacheSize } from '../../tweet-emoji.mjs';

// ─── emojiToCodepoint (pure function) ────────────────────────────────────────

describe('emojiToCodepoint', () => {
  it('converts simple emoji to hex codepoint', () => {
    expect(emojiToCodepoint('😀')).toBe('1f600');
  });

  it('converts fire emoji', () => {
    expect(emojiToCodepoint('🔥')).toBe('1f525');
  });

  it('converts party popper emoji', () => {
    expect(emojiToCodepoint('🎉')).toBe('1f389');
  });

  it('converts flag emoji (regional indicators)', () => {
    expect(emojiToCodepoint('🇺🇸')).toBe('1f1fa-1f1f8');
  });

  it('converts Japanese flag', () => {
    expect(emojiToCodepoint('🇯🇵')).toBe('1f1ef-1f1f5');
  });

  it('converts ZWJ sequence (family)', () => {
    expect(emojiToCodepoint('👨‍👩‍👧')).toBe('1f468-200d-1f469-200d-1f467');
  });

  it('converts ZWJ sequence (man technologist)', () => {
    expect(emojiToCodepoint('👨‍💻')).toBe('1f468-200d-1f4bb');
  });

  it('converts skin tone modifier emoji', () => {
    expect(emojiToCodepoint('👋🏽')).toBe('1f44b-1f3fd');
  });

  it('converts dark skin tone wave', () => {
    expect(emojiToCodepoint('👋🏿')).toBe('1f44b-1f3ff');
  });

  it('strips U+FE0F variation selector from heart', () => {
    // ❤️ = U+2764 U+FE0F
    expect(emojiToCodepoint('❤️')).toBe('2764');
  });

  it('strips U+FE0F from keycap sequence', () => {
    // 1️⃣ = U+0031 U+FE0F U+20E3
    expect(emojiToCodepoint('1️⃣')).toBe('31-20e3');
  });

  it('handles thumbs up', () => {
    expect(emojiToCodepoint('👍')).toBe('1f44d');
  });

  it('handles hundred points', () => {
    expect(emojiToCodepoint('💯')).toBe('1f4af');
  });

  it('handles sparkles', () => {
    expect(emojiToCodepoint('✨')).toBe('2728');
  });

  it('handles red heart without variation selector', () => {
    // Plain ❤ without U+FE0F
    expect(emojiToCodepoint('❤')).toBe('2764');
  });
});

// ─── fetchEmoji (network fetch + cache) ──────────────────────────────────────

describe('fetchEmoji', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    clearEmojiCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches SVG from Twemoji CDN and returns data URI', async () => {
    const mockSvg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>';
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => mockSvg,
    }));

    const result = await fetchEmoji('😀');

    expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/1f600.svg'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('decodes the data URI back to the original SVG', async () => {
    const mockSvg = '<svg><rect/></svg>';
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => mockSvg,
    }));

    const result = await fetchEmoji('🔥');
    const decoded = Buffer.from(result.replace('data:image/svg+xml;base64,', ''), 'base64').toString();
    expect(decoded).toBe(mockSvg);
  });

  it('returns cached result on second call (no duplicate fetch)', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => '<svg></svg>',
    }));

    const first = await fetchEmoji('🔥');
    const second = await fetchEmoji('🔥');

    expect(first).toBe(second);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(getEmojiCacheSize()).toBe(1);
  });

  it('caches different emoji separately', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => '<svg></svg>',
    }));

    await fetchEmoji('😀');
    await fetchEmoji('🔥');

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(getEmojiCacheSize()).toBe(2);
  });

  it('returns null and caches negative result on 404', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404 }));

    const result1 = await fetchEmoji('🏴');
    expect(result1).toBeNull();

    // Second call should NOT fetch again (cached null)
    const result2 = await fetchEmoji('🏴');
    expect(result2).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(getEmojiCacheSize()).toBe(1);
  });

  it('returns null but does NOT cache on network error (transient)', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('network down'); });

    const result = await fetchEmoji('😀');

    expect(result).toBeNull();
    expect(getEmojiCacheSize()).toBe(0);
  });

  it('retries after transient network error (not cached)', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) throw new Error('network down');
      return { ok: true, text: async () => '<svg></svg>' };
    });

    const result1 = await fetchEmoji('😀');
    expect(result1).toBeNull();

    // Clear to allow re-import behavior — since cache is empty, it will retry
    const result2 = await fetchEmoji('😀');
    expect(result2).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('uses correct CDN URL format for compound emoji', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => '<svg></svg>',
    }));

    await fetchEmoji('👨‍💻');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/1f468-200d-1f4bb.svg'),
      expect.anything(),
    );
  });

  it('uses correct CDN URL format for flag emoji', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => '<svg></svg>',
    }));

    await fetchEmoji('🇺🇸');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/1f1fa-1f1f8.svg'),
      expect.anything(),
    );
  });

  it('clearEmojiCache resets cache to empty', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => '<svg></svg>',
    }));

    await fetchEmoji('😀');
    expect(getEmojiCacheSize()).toBe(1);

    clearEmojiCache();
    expect(getEmojiCacheSize()).toBe(0);
  });
});
