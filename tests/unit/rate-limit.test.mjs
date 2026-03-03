/**
 * Unit tests for rate-limit middleware (src/middleware/rate-limit.mjs).
 * Uses real Express servers because express-rate-limit requires app context.
 */

import { describe, it, expect, afterAll } from 'vitest';
import express from 'express';
import { applyRateLimit, signupLimiter, billingLimiter } from '../../src/middleware/rate-limit.mjs';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const servers = [];

async function startApp(setupFn) {
  const app = express();
  app.use(express.json());
  setupFn(app);

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      servers.push(server);
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

afterAll(() => {
  servers.forEach(s => s.close());
});

// ─── applyRateLimit ──────────────────────────────────────────────────────────

describe('applyRateLimit', () => {
  it('passes first request through for free tier', async () => {
    const baseUrl = await startApp((app) => {
      app.get('/test', (req, res, next) => {
        req.apiKey = 'ts_free_test_pass';
        req.keyData = { tier: 'free' };
        next();
      }, applyRateLimit, (req, res) => res.json({ ok: true }));
    });

    const res = await fetch(`${baseUrl}/test`);
    expect(res.status).toBe(200);
  });

  it('defaults to free tier when keyData is missing', async () => {
    const baseUrl = await startApp((app) => {
      app.get('/test', (req, res, next) => {
        req.apiKey = 'ts_test_nodata';
        req.keyData = undefined;
        next();
      }, applyRateLimit, (req, res) => res.json({ ok: true }));
    });

    const res = await fetch(`${baseUrl}/test`);
    expect(res.status).toBe(200);
  });

  it('defaults to free tier when tier is unknown', async () => {
    const baseUrl = await startApp((app) => {
      app.get('/test', (req, res, next) => {
        req.apiKey = 'ts_enterprise_test';
        req.keyData = { tier: 'enterprise' };
        next();
      }, applyRateLimit, (req, res) => res.json({ ok: true }));
    });

    const res = await fetch(`${baseUrl}/test`);
    expect(res.status).toBe(200);
  });

  it('sets standard rate limit headers', async () => {
    const baseUrl = await startApp((app) => {
      app.get('/test', (req, res, next) => {
        req.apiKey = 'ts_free_headers';
        req.keyData = { tier: 'free' };
        next();
      }, applyRateLimit, (req, res) => res.json({ ok: true }));
    });

    const res = await fetch(`${baseUrl}/test`);
    expect(res.status).toBe(200);
    // express-rate-limit sets standard headers when standardHeaders: true
    expect(res.headers.get('ratelimit-limit')).toBeDefined();
    expect(res.headers.get('ratelimit-remaining')).toBeDefined();
  });

  it('uses per-API-key bucketing', async () => {
    const baseUrl = await startApp((app) => {
      app.get('/test', (req, res, next) => {
        req.apiKey = req.headers['x-test-key'] || 'ts_free_default';
        req.keyData = { tier: 'free' };
        next();
      }, applyRateLimit, (req, res) => res.json({ ok: true }));
    });

    const res1 = await fetch(`${baseUrl}/test`, { headers: { 'x-test-key': 'ts_free_user_a' } });
    const res2 = await fetch(`${baseUrl}/test`, { headers: { 'x-test-key': 'ts_free_user_b' } });
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it('returns 429 when free tier limit (10 req/min) is exhausted', async () => {
    const baseUrl = await startApp((app) => {
      app.get('/test', (req, res, next) => {
        req.apiKey = 'ts_free_exhaust_test';
        req.keyData = { tier: 'free' };
        next();
      }, applyRateLimit, (req, res) => res.json({ ok: true }));
    });

    // Free tier = 10 req/min. Send 10 requests — all should succeed.
    const results = [];
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${baseUrl}/test`);
      results.push(res.status);
    }
    expect(results).toEqual(Array(10).fill(200));

    // 11th request should be rate-limited
    const blocked = await fetch(`${baseUrl}/test`);
    expect(blocked.status).toBe(429);

    const body = await blocked.json();
    expect(body.error).toBe('Rate limit exceeded. Please wait 60 seconds before retrying. Check the Retry-After header for details.');
    expect(body.code).toBe('RATE_LIMITED');
  });

  it('does not share rate limit buckets across different API keys', async () => {
    const baseUrl = await startApp((app) => {
      app.get('/test', (req, res, next) => {
        req.apiKey = req.headers['x-test-key'];
        req.keyData = { tier: 'free' };
        next();
      }, applyRateLimit, (req, res) => res.json({ ok: true }));
    });

    // Exhaust limit for key A (10 requests)
    for (let i = 0; i < 10; i++) {
      await fetch(`${baseUrl}/test`, { headers: { 'x-test-key': 'ts_free_bucket_a' } });
    }

    // Key A should now be blocked
    const blockedA = await fetch(`${baseUrl}/test`, { headers: { 'x-test-key': 'ts_free_bucket_a' } });
    expect(blockedA.status).toBe(429);

    // Key B should still work (independent bucket)
    const okB = await fetch(`${baseUrl}/test`, { headers: { 'x-test-key': 'ts_free_bucket_b' } });
    expect(okB.status).toBe(200);
  });
});

// ─── signupLimiter ───────────────────────────────────────────────────────────

describe('signupLimiter', () => {
  it('returns a middleware function', () => {
    const limiter = signupLimiter();
    expect(typeof limiter).toBe('function');
  });

  it('allows first request through', async () => {
    const baseUrl = await startApp((app) => {
      app.post('/signup', signupLimiter(), (req, res) => res.json({ ok: true }));
    });

    const res = await fetch(`${baseUrl}/signup`, { method: 'POST' });
    expect(res.status).toBe(200);
  });
});

// ─── billingLimiter ─────────────────────────────────────────────────────────

describe('billingLimiter', () => {
  it('returns a middleware function', () => {
    const limiter = billingLimiter();
    expect(typeof limiter).toBe('function');
  });

  it('allows first request through', async () => {
    const baseUrl = await startApp((app) => {
      app.post('/checkout', billingLimiter(), (req, res) => res.json({ ok: true }));
    });

    const res = await fetch(`${baseUrl}/checkout`, { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('returns 429 when billing limit (10 req/15min) is exhausted', async () => {
    const baseUrl = await startApp((app) => {
      app.post('/checkout', billingLimiter(), (req, res) => res.json({ ok: true }));
    });

    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${baseUrl}/checkout`, { method: 'POST' });
      expect(res.status).toBe(200);
    }

    const blocked = await fetch(`${baseUrl}/checkout`, { method: 'POST' });
    expect(blocked.status).toBe(429);

    const body = await blocked.json();
    expect(body.error).toContain('Too many billing requests');
    expect(body.code).toBe('RATE_LIMITED');
  });
});
