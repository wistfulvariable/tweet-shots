/**
 * Unit tests for Zod request schemas.
 */

import { describe, it, expect } from 'vitest';
import {
  screenshotQuerySchema,
  screenshotBodySchema,
  createKeySchema,
  signupSchema,
  checkoutSchema,
  portalSchema,
} from '../../src/schemas/request-schemas.mjs';

describe('screenshotQuerySchema', () => {
  it('accepts valid defaults', () => {
    const result = screenshotQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.theme).toBe('dark');
    expect(result.data.dimension).toBe('auto');
    expect(result.data.format).toBe('png');
    expect(result.data.scale).toBe(2);
    expect(result.data.padding).toBe(20);
    expect(result.data.radius).toBe(16);
  });

  it('accepts all valid themes', () => {
    for (const theme of ['light', 'dark', 'dim', 'black']) {
      const result = screenshotQuerySchema.safeParse({ theme });
      expect(result.success, `theme "${theme}" should be valid`).toBe(true);
    }
  });

  it('rejects invalid theme', () => {
    const result = screenshotQuerySchema.safeParse({ theme: 'neon' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid dimensions', () => {
    const dims = ['auto', 'instagramFeed', 'instagramStory', 'instagramVertical',
      'tiktok', 'linkedin', 'twitter', 'facebook', 'youtube'];
    for (const dimension of dims) {
      const result = screenshotQuerySchema.safeParse({ dimension });
      expect(result.success, `dimension "${dimension}" should be valid`).toBe(true);
    }
  });

  it('coerces scale string to number', () => {
    const result = screenshotQuerySchema.safeParse({ scale: '2' });
    expect(result.success).toBe(true);
    expect(result.data.scale).toBe(2);
  });

  it('rejects scale > 3', () => {
    const result = screenshotQuerySchema.safeParse({ scale: '5' });
    expect(result.success).toBe(false);
  });

  it('rejects scale < 1', () => {
    const result = screenshotQuerySchema.safeParse({ scale: '0' });
    expect(result.success).toBe(false);
  });

  it('accepts valid hex color', () => {
    const result = screenshotQuerySchema.safeParse({ bgColor: '#ff0000' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid hex color', () => {
    const result = screenshotQuerySchema.safeParse({ bgColor: 'red' });
    expect(result.success).toBe(false);
  });

  it('rejects hex color without hash', () => {
    const result = screenshotQuerySchema.safeParse({ bgColor: 'ff0000' });
    expect(result.success).toBe(false);
  });

  it('transforms boolean strings correctly', () => {
    const result = screenshotQuerySchema.safeParse({ hideMetrics: 'true', hideMedia: 'false' });
    expect(result.success).toBe(true);
    expect(result.data.hideMetrics).toBe(true);
    expect(result.data.hideMedia).toBe(false);
  });

  it('accepts valid gradient', () => {
    const result = screenshotQuerySchema.safeParse({ gradient: 'sunset' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid gradient', () => {
    const result = screenshotQuerySchema.safeParse({ gradient: 'rainbow' });
    expect(result.success).toBe(false);
  });

  it('rejects padding > 100', () => {
    const result = screenshotQuerySchema.safeParse({ padding: '150' });
    expect(result.success).toBe(false);
  });

  it('rejects negative radius', () => {
    const result = screenshotQuerySchema.safeParse({ radius: '-5' });
    expect(result.success).toBe(false);
  });

  it('transforms showUrl boolean string to boolean', () => {
    const result = screenshotQuerySchema.safeParse({ showUrl: 'true' });
    expect(result.success).toBe(true);
    expect(result.data.showUrl).toBe(true);
  });

  it('defaults showUrl to false when omitted', () => {
    const result = screenshotQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.showUrl).toBe(false);
  });

  it('accepts valid fontFamily', () => {
    const result = screenshotQuerySchema.safeParse({ fontFamily: 'Roboto' });
    expect(result.success).toBe(true);
    expect(result.data.fontFamily).toBe('Roboto');
  });

  it('rejects fontFamily longer than 100 characters', () => {
    const result = screenshotQuerySchema.safeParse({ fontFamily: 'A'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('accepts valid fontUrl', () => {
    const result = screenshotQuerySchema.safeParse({ fontUrl: 'https://fonts.example.com/roboto.woff' });
    expect(result.success).toBe(true);
  });

  it('rejects fontUrl that is not a URL', () => {
    const result = screenshotQuerySchema.safeParse({ fontUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('accepts valid fontBoldUrl', () => {
    const result = screenshotQuerySchema.safeParse({ fontBoldUrl: 'https://fonts.example.com/roboto-bold.woff' });
    expect(result.success).toBe(true);
  });

  it('rejects fontBoldUrl that is not a URL', () => {
    const result = screenshotQuerySchema.safeParse({ fontBoldUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('font fields are optional (not required)', () => {
    const result = screenshotQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.fontFamily).toBeUndefined();
    expect(result.data.fontUrl).toBeUndefined();
    expect(result.data.fontBoldUrl).toBeUndefined();
  });

  it('accepts valid outputWidth', () => {
    const result = screenshotQuerySchema.safeParse({ outputWidth: '800' });
    expect(result.success).toBe(true);
    expect(result.data.outputWidth).toBe(800);
  });

  it('coerces outputWidth string to number', () => {
    const result = screenshotQuerySchema.safeParse({ outputWidth: '1200' });
    expect(result.success).toBe(true);
    expect(result.data.outputWidth).toBe(1200);
  });

  it('rejects outputWidth below minimum (50)', () => {
    const result = screenshotQuerySchema.safeParse({ outputWidth: '10' });
    expect(result.success).toBe(false);
  });

  it('rejects outputWidth above maximum (5000)', () => {
    const result = screenshotQuerySchema.safeParse({ outputWidth: '6000' });
    expect(result.success).toBe(false);
  });

  it('outputWidth is optional (undefined when omitted)', () => {
    const result = screenshotQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.outputWidth).toBeUndefined();
  });

  it('rejects non-integer outputWidth', () => {
    const result = screenshotQuerySchema.safeParse({ outputWidth: '800.5' });
    expect(result.success).toBe(false);
  });
});

describe('screenshotBodySchema', () => {
  it('requires tweetId or tweetUrl', () => {
    const result = screenshotBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts tweetId alone', () => {
    const result = screenshotBodySchema.safeParse({ tweetId: '12345' });
    expect(result.success).toBe(true);
  });

  it('accepts tweetUrl alone', () => {
    const result = screenshotBodySchema.safeParse({ tweetUrl: 'https://x.com/user/status/12345' });
    expect(result.success).toBe(true);
  });

  it('applies correct defaults', () => {
    const result = screenshotBodySchema.safeParse({ tweetId: '12345' });
    expect(result.success).toBe(true);
    expect(result.data.response).toBe('image');
    expect(result.data.theme).toBe('dark');
    expect(result.data.scale).toBe(2);
    expect(result.data.hideMetrics).toBe(false);
    expect(result.data.hideMedia).toBe(false);
  });

  it('accepts all response types', () => {
    for (const response of ['image', 'base64', 'url']) {
      const result = screenshotBodySchema.safeParse({ tweetId: '12345', response });
      expect(result.success, `response "${response}" should be valid`).toBe(true);
    }
  });

  it('rejects invalid response type', () => {
    const result = screenshotBodySchema.safeParse({ tweetId: '12345', response: 'json' });
    expect(result.success).toBe(false);
  });

  it('accepts boolean hideMetrics', () => {
    const result = screenshotBodySchema.safeParse({ tweetId: '12345', hideMetrics: true });
    expect(result.success).toBe(true);
    expect(result.data.hideMetrics).toBe(true);
  });

  it('rejects scale > 3', () => {
    const result = screenshotBodySchema.safeParse({ tweetId: '12345', scale: 10 });
    expect(result.success).toBe(false);
  });

  it('accepts boolean showUrl', () => {
    const result = screenshotBodySchema.safeParse({ tweetId: '12345', showUrl: true });
    expect(result.success).toBe(true);
    expect(result.data.showUrl).toBe(true);
  });

  it('defaults showUrl to false in body schema', () => {
    const result = screenshotBodySchema.safeParse({ tweetId: '12345' });
    expect(result.success).toBe(true);
    expect(result.data.showUrl).toBe(false);
  });

  it('accepts fontFamily, fontUrl, and fontBoldUrl in POST body', () => {
    const result = screenshotBodySchema.safeParse({
      tweetId: '12345',
      fontFamily: 'Roboto',
      fontUrl: 'https://fonts.example.com/roboto.woff',
      fontBoldUrl: 'https://fonts.example.com/roboto-bold.woff',
    });
    expect(result.success).toBe(true);
    expect(result.data.fontFamily).toBe('Roboto');
    expect(result.data.fontUrl).toBe('https://fonts.example.com/roboto.woff');
    expect(result.data.fontBoldUrl).toBe('https://fonts.example.com/roboto-bold.woff');
  });

  it('rejects invalid fontUrl in POST body', () => {
    const result = screenshotBodySchema.safeParse({
      tweetId: '12345',
      fontUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('font fields are optional in POST body', () => {
    const result = screenshotBodySchema.safeParse({ tweetId: '12345' });
    expect(result.success).toBe(true);
    expect(result.data.fontFamily).toBeUndefined();
    expect(result.data.fontUrl).toBeUndefined();
    expect(result.data.fontBoldUrl).toBeUndefined();
  });

  it('accepts valid outputWidth in POST body', () => {
    const result = screenshotBodySchema.safeParse({ tweetId: '12345', outputWidth: 800 });
    expect(result.success).toBe(true);
    expect(result.data.outputWidth).toBe(800);
  });

  it('rejects outputWidth below minimum (50) in POST body', () => {
    const result = screenshotBodySchema.safeParse({ tweetId: '12345', outputWidth: 30 });
    expect(result.success).toBe(false);
  });

  it('rejects outputWidth above maximum (5000) in POST body', () => {
    const result = screenshotBodySchema.safeParse({ tweetId: '12345', outputWidth: 10000 });
    expect(result.success).toBe(false);
  });

  it('outputWidth is optional in POST body', () => {
    const result = screenshotBodySchema.safeParse({ tweetId: '12345' });
    expect(result.success).toBe(true);
    expect(result.data.outputWidth).toBeUndefined();
  });
});

describe('createKeySchema', () => {
  it('defaults tier to free', () => {
    const result = createKeySchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data.tier).toBe('free');
  });

  it('accepts valid tiers', () => {
    for (const tier of ['free', 'pro', 'business']) {
      const result = createKeySchema.safeParse({ tier });
      expect(result.success, `tier "${tier}" should be valid`).toBe(true);
    }
  });

  it('rejects invalid tier', () => {
    const result = createKeySchema.safeParse({ tier: 'enterprise' });
    expect(result.success).toBe(false);
  });

  it('validates name length', () => {
    const result = createKeySchema.safeParse({ name: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });
});

describe('signupSchema', () => {
  it('requires valid email', () => {
    const result = signupSchema.safeParse({ email: 'test@example.com' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = signupSchema.safeParse({ email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects missing email', () => {
    const result = signupSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('checkoutSchema', () => {
  it('requires email and tier', () => {
    const result = checkoutSchema.safeParse({ email: 'test@example.com', tier: 'pro' });
    expect(result.success).toBe(true);
  });

  it('only accepts pro and business tiers', () => {
    const free = checkoutSchema.safeParse({ email: 'test@example.com', tier: 'free' });
    expect(free.success).toBe(false);

    const pro = checkoutSchema.safeParse({ email: 'test@example.com', tier: 'pro' });
    expect(pro.success).toBe(true);

    const biz = checkoutSchema.safeParse({ email: 'test@example.com', tier: 'business' });
    expect(biz.success).toBe(true);
  });

  it('validates optional URLs', () => {
    const result = checkoutSchema.safeParse({
      email: 'test@example.com',
      tier: 'pro',
      successUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

describe('portalSchema', () => {
  it('requires email', () => {
    const result = portalSchema.safeParse({ email: 'test@example.com' });
    expect(result.success).toBe(true);
  });

  it('validates optional returnUrl', () => {
    const valid = portalSchema.safeParse({
      email: 'test@example.com',
      returnUrl: 'https://example.com',
    });
    expect(valid.success).toBe(true);

    const invalid = portalSchema.safeParse({
      email: 'test@example.com',
      returnUrl: 'not-a-url',
    });
    expect(invalid.success).toBe(false);
  });
});
