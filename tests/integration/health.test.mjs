/**
 * Integration tests for health, docs, pricing, and landing endpoints.
 * These are public endpoints — no auth required.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import { healthRoutes } from '../../src/routes/health.mjs';
import { landingRoutes } from '../../src/routes/landing.mjs';

let app, server, baseUrl;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(landingRoutes());
  app.use(healthRoutes());

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});

describe('GET /pricing', () => {
  it('returns all tiers with pricing info', async () => {
    const res = await fetch(`${baseUrl}/pricing`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.tiers).toHaveLength(3);

    const tierNames = body.tiers.map(t => t.tier);
    expect(tierNames).toContain('free');
    expect(tierNames).toContain('pro');
    expect(tierNames).toContain('business');

    const free = body.tiers.find(t => t.tier === 'free');
    expect(free.price).toBe(0);
    expect(free.monthlyCredits).toBe(50);
  });
});

describe('GET /docs', () => {
  it('returns API documentation', async () => {
    const res = await fetch(`${baseUrl}/docs`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.authentication).toBeDefined();
    expect(body.endpoints).toBeDefined();
    expect(body.rateLimits).toBeDefined();
  });
});

describe('GET /', () => {
  it('returns JSON API info for non-HTML clients', async () => {
    const res = await fetch(`${baseUrl}/`, {
      headers: { Accept: 'application/json' },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.name).toBe('tweet-shots API');
    expect(body.endpoints).toBeDefined();
  });
});
