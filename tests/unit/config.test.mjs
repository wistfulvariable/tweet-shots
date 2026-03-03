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
  it('defines free, pro, and business tiers', () => {
    expect(TIERS).toHaveProperty('free');
    expect(TIERS).toHaveProperty('pro');
    expect(TIERS).toHaveProperty('business');
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
});

describe('VALID_TIERS', () => {
  it('contains exactly three tiers', () => {
    expect(VALID_TIERS).toHaveLength(3);
    expect(VALID_TIERS).toContain('free');
    expect(VALID_TIERS).toContain('pro');
    expect(VALID_TIERS).toContain('business');
  });
});
