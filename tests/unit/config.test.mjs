/**
 * Unit tests for configuration module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, TIERS, VALID_TIERS } from '../../src/config.mjs';

describe('loadConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env to known state
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('loads valid config with required env vars', () => {
    process.env.ADMIN_KEY = 'test-admin-key-long-enough';
    process.env.NODE_ENV = 'development';
    const config = loadConfig();
    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe('0.0.0.0');
    expect(config.NODE_ENV).toBe('development');
    expect(config.ADMIN_KEY).toBe('test-admin-key-long-enough');
  });

  it('throws on missing ADMIN_KEY', () => {
    delete process.env.ADMIN_KEY;
    expect(() => loadConfig()).toThrow('Invalid configuration');
  });

  it('throws on short ADMIN_KEY', () => {
    process.env.ADMIN_KEY = 'short';
    expect(() => loadConfig()).toThrow('ADMIN_KEY');
  });

  it('uses default PORT of 3000', () => {
    process.env.ADMIN_KEY = 'test-admin-key-long-enough';
    delete process.env.PORT;
    const config = loadConfig();
    expect(config.PORT).toBe(3000);
  });

  it('overrides PORT from env', () => {
    process.env.ADMIN_KEY = 'test-admin-key-long-enough';
    process.env.PORT = '8080';
    const config = loadConfig();
    expect(config.PORT).toBe(8080);
  });

  it('accepts valid NODE_ENV values', () => {
    process.env.ADMIN_KEY = 'test-admin-key-long-enough';
    for (const env of ['development', 'production', 'test']) {
      process.env.NODE_ENV = env;
      const config = loadConfig();
      expect(config.NODE_ENV).toBe(env);
    }
  });

  it('returns frozen config object', () => {
    process.env.ADMIN_KEY = 'test-admin-key-long-enough';
    const config = loadConfig();
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('allows optional Stripe keys', () => {
    process.env.ADMIN_KEY = 'test-admin-key-long-enough';
    const config = loadConfig();
    expect(config.STRIPE_SECRET_KEY).toBeUndefined();
    expect(config.STRIPE_WEBHOOK_SECRET).toBeUndefined();
  });
});

describe('TIERS', () => {
  it('defines free, pro, business, and owner tiers', () => {
    expect(TIERS).toHaveProperty('free');
    expect(TIERS).toHaveProperty('pro');
    expect(TIERS).toHaveProperty('business');
    expect(TIERS).toHaveProperty('owner');
  });

  it('has increasing rate limits', () => {
    expect(TIERS.free.rateLimit).toBeLessThan(TIERS.pro.rateLimit);
    expect(TIERS.pro.rateLimit).toBeLessThan(TIERS.business.rateLimit);
  });

  it('has increasing monthly credits', () => {
    expect(TIERS.free.monthlyCredits).toBeLessThan(TIERS.pro.monthlyCredits);
    expect(TIERS.pro.monthlyCredits).toBeLessThan(TIERS.business.monthlyCredits);
  });

  it('free tier has price 0', () => {
    expect(TIERS.free.price).toBe(0);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(TIERS)).toBe(true);
  });

  it('each tier has maxOutputWidth and maxScale properties', () => {
    for (const tier of Object.keys(TIERS)) {
      expect(TIERS[tier]).toHaveProperty('maxOutputWidth');
      expect(TIERS[tier]).toHaveProperty('maxScale');
      expect(typeof TIERS[tier].maxOutputWidth).toBe('number');
      expect(typeof TIERS[tier].maxScale).toBe('number');
    }
  });

  it('free tier: maxOutputWidth=1080, maxScale=2', () => {
    expect(TIERS.free.maxOutputWidth).toBe(1080);
    expect(TIERS.free.maxScale).toBe(2);
  });

  it('pro tier: maxOutputWidth=4000, maxScale=3', () => {
    expect(TIERS.pro.maxOutputWidth).toBe(4000);
    expect(TIERS.pro.maxScale).toBe(3);
  });

  it('business tier: maxOutputWidth=5000, maxScale=3', () => {
    expect(TIERS.business.maxOutputWidth).toBe(5000);
    expect(TIERS.business.maxScale).toBe(3);
  });

  it('owner tier: maxOutputWidth=5000, maxScale=3', () => {
    expect(TIERS.owner.maxOutputWidth).toBe(5000);
    expect(TIERS.owner.maxScale).toBe(3);
  });

  it('free tier has the most restrictive resolution limits', () => {
    expect(TIERS.free.maxOutputWidth).toBeLessThan(TIERS.pro.maxOutputWidth);
    expect(TIERS.free.maxScale).toBeLessThanOrEqual(TIERS.pro.maxScale);
  });
});

describe('VALID_TIERS', () => {
  it('contains all four tiers', () => {
    expect(VALID_TIERS).toHaveLength(4);
    expect(VALID_TIERS).toContain('free');
    expect(VALID_TIERS).toContain('pro');
    expect(VALID_TIERS).toContain('business');
    expect(VALID_TIERS).toContain('owner');
  });
});
