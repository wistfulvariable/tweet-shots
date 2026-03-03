/**
 * Unit tests for demoQuerySchema — validates GET query parameters for the demo endpoint.
 * Subset of screenshotQuerySchema: no format, scale, or custom colors.
 */

import { describe, it, expect } from 'vitest';
import { demoQuerySchema } from '../../src/schemas/request-schemas.mjs';

describe('demoQuerySchema', () => {
  // ── Defaults ────────────────────────────────────────────────────────

  describe('defaults', () => {
    it('parses empty object successfully with all defaults', () => {
      const result = demoQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.theme).toBe('dark');
      expect(result.data.dimension).toBe('auto');
      expect(result.data.padding).toBe(20);
      expect(result.data.radius).toBe(16);
      // NOTE: Zod .default('false') injects the raw string BEFORE .transform() runs,
      // so omitted boolean fields get the string "false" rather than boolean false.
      // This is a known Zod behavior — the transform only fires on explicitly provided values.
      expect(result.data.hideMetrics).toBe('false');
      expect(result.data.hideMedia).toBe('false');
      expect(result.data.hideDate).toBe('false');
      expect(result.data.hideVerified).toBe('false');
      expect(result.data.hideShadow).toBe('false');
      expect(result.data.hideQuoteTweet).toBe('false');
    });

    it('does not include gradient when not provided', () => {
      const result = demoQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.gradient).toBeUndefined();
    });
  });

  // ── Theme ───────────────────────────────────────────────────────────

  describe('theme', () => {
    it('accepts all valid theme values', () => {
      for (const theme of ['light', 'dark', 'dim', 'black']) {
        const result = demoQuerySchema.safeParse({ theme });
        expect(result.success, `theme "${theme}" should be valid`).toBe(true);
        expect(result.data.theme).toBe(theme);
      }
    });

    it('rejects invalid theme', () => {
      const result = demoQuerySchema.safeParse({ theme: 'neon' });
      expect(result.success).toBe(false);
    });

    it('rejects empty string theme', () => {
      const result = demoQuerySchema.safeParse({ theme: '' });
      expect(result.success).toBe(false);
    });
  });

  // ── Dimension ───────────────────────────────────────────────────────

  describe('dimension', () => {
    it('accepts all valid dimension values', () => {
      const dims = [
        'auto', 'instagramFeed', 'instagramStory', 'instagramVertical',
        'tiktok', 'linkedin', 'twitter', 'facebook', 'youtube',
      ];
      for (const dimension of dims) {
        const result = demoQuerySchema.safeParse({ dimension });
        expect(result.success, `dimension "${dimension}" should be valid`).toBe(true);
        expect(result.data.dimension).toBe(dimension);
      }
    });

    it('rejects invalid dimension', () => {
      const result = demoQuerySchema.safeParse({ dimension: 'pinterest' });
      expect(result.success).toBe(false);
    });

    it('rejects empty string dimension', () => {
      const result = demoQuerySchema.safeParse({ dimension: '' });
      expect(result.success).toBe(false);
    });
  });

  // ── Gradient ────────────────────────────────────────────────────────

  describe('gradient', () => {
    it('accepts all valid gradient values', () => {
      const gradients = ['sunset', 'ocean', 'forest', 'fire', 'midnight', 'sky', 'candy', 'peach'];
      for (const gradient of gradients) {
        const result = demoQuerySchema.safeParse({ gradient });
        expect(result.success, `gradient "${gradient}" should be valid`).toBe(true);
        expect(result.data.gradient).toBe(gradient);
      }
    });

    it('is undefined when not provided', () => {
      const result = demoQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      expect(result.data.gradient).toBeUndefined();
    });

    it('rejects invalid gradient', () => {
      const result = demoQuerySchema.safeParse({ gradient: 'rainbow' });
      expect(result.success).toBe(false);
    });
  });

  // ── Boolean string fields ──────────────────────────────────────────

  describe('boolean string fields', () => {
    const boolFields = [
      'hideMetrics', 'hideMedia', 'hideDate',
      'hideVerified', 'hideShadow', 'hideQuoteTweet',
    ];

    it('transforms "true" string to boolean true', () => {
      for (const field of boolFields) {
        const result = demoQuerySchema.safeParse({ [field]: 'true' });
        expect(result.success, `${field} "true" should parse`).toBe(true);
        expect(result.data[field], `${field} should transform to true`).toBe(true);
      }
    });

    it('transforms "false" string to boolean false', () => {
      for (const field of boolFields) {
        const result = demoQuerySchema.safeParse({ [field]: 'false' });
        expect(result.success, `${field} "false" should parse`).toBe(true);
        expect(result.data[field], `${field} should transform to false`).toBe(false);
      }
    });

    it('defaults all boolean fields to string "false" when omitted', () => {
      // See note in defaults test: Zod .default('false') bypasses .transform(),
      // so the default is the raw string "false", not boolean false.
      const result = demoQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      for (const field of boolFields) {
        expect(result.data[field], `${field} should default to string "false"`).toBe('false');
      }
    });

    it('rejects non-boolean strings', () => {
      for (const field of boolFields) {
        const result = demoQuerySchema.safeParse({ [field]: 'yes' });
        expect(result.success, `${field} "yes" should be rejected`).toBe(false);
      }
    });

    it('rejects actual boolean values (query params are strings)', () => {
      for (const field of boolFields) {
        const result = demoQuerySchema.safeParse({ [field]: true });
        expect(result.success, `${field} boolean true should be rejected`).toBe(false);
      }
    });

    it('allows mixing multiple boolean fields', () => {
      const result = demoQuerySchema.safeParse({
        hideMetrics: 'true',
        hideMedia: 'false',
        hideDate: 'true',
        hideVerified: 'false',
        hideShadow: 'true',
        hideQuoteTweet: 'false',
      });
      expect(result.success).toBe(true);
      expect(result.data.hideMetrics).toBe(true);
      expect(result.data.hideMedia).toBe(false);
      expect(result.data.hideDate).toBe(true);
      expect(result.data.hideVerified).toBe(false);
      expect(result.data.hideShadow).toBe(true);
      expect(result.data.hideQuoteTweet).toBe(false);
    });
  });

  // ── Padding ─────────────────────────────────────────────────────────

  describe('padding', () => {
    it('accepts minimum value (0)', () => {
      const result = demoQuerySchema.safeParse({ padding: 0 });
      expect(result.success).toBe(true);
      expect(result.data.padding).toBe(0);
    });

    it('accepts maximum value (100)', () => {
      const result = demoQuerySchema.safeParse({ padding: 100 });
      expect(result.success).toBe(true);
      expect(result.data.padding).toBe(100);
    });

    it('accepts mid-range value', () => {
      const result = demoQuerySchema.safeParse({ padding: 50 });
      expect(result.success).toBe(true);
      expect(result.data.padding).toBe(50);
    });

    it('rejects negative padding', () => {
      const result = demoQuerySchema.safeParse({ padding: -1 });
      expect(result.success).toBe(false);
    });

    it('rejects padding greater than 100', () => {
      const result = demoQuerySchema.safeParse({ padding: 101 });
      expect(result.success).toBe(false);
    });

    it('coerces string number to integer', () => {
      const result = demoQuerySchema.safeParse({ padding: '50' });
      expect(result.success).toBe(true);
      expect(result.data.padding).toBe(50);
    });

    it('coerces string "0" to number 0', () => {
      const result = demoQuerySchema.safeParse({ padding: '0' });
      expect(result.success).toBe(true);
      expect(result.data.padding).toBe(0);
    });

    it('rejects non-integer value', () => {
      const result = demoQuerySchema.safeParse({ padding: '10.5' });
      expect(result.success).toBe(false);
    });

    it('rejects non-numeric string', () => {
      const result = demoQuerySchema.safeParse({ padding: 'abc' });
      expect(result.success).toBe(false);
    });
  });

  // ── Radius ──────────────────────────────────────────────────────────

  describe('radius', () => {
    it('accepts minimum value (0)', () => {
      const result = demoQuerySchema.safeParse({ radius: 0 });
      expect(result.success).toBe(true);
      expect(result.data.radius).toBe(0);
    });

    it('accepts maximum value (100)', () => {
      const result = demoQuerySchema.safeParse({ radius: 100 });
      expect(result.success).toBe(true);
      expect(result.data.radius).toBe(100);
    });

    it('accepts mid-range value', () => {
      const result = demoQuerySchema.safeParse({ radius: 50 });
      expect(result.success).toBe(true);
      expect(result.data.radius).toBe(50);
    });

    it('rejects negative radius', () => {
      const result = demoQuerySchema.safeParse({ radius: -5 });
      expect(result.success).toBe(false);
    });

    it('rejects radius greater than 100', () => {
      const result = demoQuerySchema.safeParse({ radius: 200 });
      expect(result.success).toBe(false);
    });

    it('coerces string number to integer', () => {
      const result = demoQuerySchema.safeParse({ radius: '25' });
      expect(result.success).toBe(true);
      expect(result.data.radius).toBe(25);
    });

    it('rejects non-integer value', () => {
      const result = demoQuerySchema.safeParse({ radius: '10.5' });
      expect(result.success).toBe(false);
    });

    it('rejects non-numeric string', () => {
      const result = demoQuerySchema.safeParse({ radius: 'round' });
      expect(result.success).toBe(false);
    });
  });

  // ── Unknown fields stripped ─────────────────────────────────────────

  describe('unknown fields', () => {
    it('strips format field (not part of demo schema)', () => {
      const result = demoQuerySchema.safeParse({ format: 'svg' });
      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty('format');
    });

    it('strips scale field (not part of demo schema)', () => {
      const result = demoQuerySchema.safeParse({ scale: '2' });
      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty('scale');
    });

    it('strips bgColor field (not part of demo schema)', () => {
      const result = demoQuerySchema.safeParse({ bgColor: '#ff0000' });
      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty('bgColor');
    });

    it('strips textColor field (not part of demo schema)', () => {
      const result = demoQuerySchema.safeParse({ textColor: '#00ff00' });
      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty('textColor');
    });

    it('strips linkColor field (not part of demo schema)', () => {
      const result = demoQuerySchema.safeParse({ linkColor: '#0000ff' });
      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty('linkColor');
    });

    it('strips arbitrary unknown fields', () => {
      const result = demoQuerySchema.safeParse({ foo: 'bar', baz: 123 });
      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty('foo');
      expect(result.data).not.toHaveProperty('baz');
    });
  });

  // ── Full valid input ────────────────────────────────────────────────

  describe('full valid input', () => {
    it('parses a complete set of valid parameters', () => {
      const result = demoQuerySchema.safeParse({
        theme: 'dim',
        dimension: 'instagramStory',
        gradient: 'ocean',
        hideMetrics: 'true',
        hideMedia: 'false',
        hideDate: 'true',
        hideVerified: 'false',
        hideShadow: 'true',
        hideQuoteTweet: 'false',
        padding: '30',
        radius: '8',
      });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        theme: 'dim',
        dimension: 'instagramStory',
        gradient: 'ocean',
        hideMetrics: true,
        hideMedia: false,
        hideDate: true,
        hideVerified: false,
        hideShadow: true,
        hideQuoteTweet: false,
        padding: 30,
        radius: 8,
      });
    });
  });
});
