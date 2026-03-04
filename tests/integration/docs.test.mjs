/**
 * Integration tests for API documentation endpoints.
 * Tests /docs (HTML + JSON), /docs/llm (plain text), and /docs.js (cached JS).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { docsRoutes } from '../../src/routes/docs.mjs';

let app, server, baseUrl;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(docsRoutes());

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

// ─── GET /docs ────────────────────────────────────────────────────

describe('GET /docs', () => {
  it('returns JSON API documentation for non-HTML clients', async () => {
    const res = await fetch(`${baseUrl}/docs`, {
      headers: { Accept: 'application/json' },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.authentication).toBeDefined();
    expect(body.authentication.description).toContain('X-API-KEY');
    expect(body.endpoints).toBeDefined();
    expect(body.endpoints['GET /screenshot/:tweetIdOrUrl']).toBeDefined();
    expect(body.endpoints['POST /screenshot']).toBeDefined();
    expect(body.endpoints['GET /tweet/:tweetIdOrUrl']).toBeDefined();
    expect(body.rateLimits).toBeDefined();
    expect(body.rateLimits.free).toContain('req/min');
    expect(body.rateLimits.pro).toContain('req/min');
    expect(body.rateLimits.business).toContain('req/min');
  });

  it('returns HTML documentation page for browser clients', async () => {
    const res = await fetch(`${baseUrl}/docs`, {
      headers: { Accept: 'text/html' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    const text = await res.text();
    expect(text).toContain('API Documentation');
    expect(text).toContain('Authentication');
    expect(text).toContain('/screenshot');
    expect(text).toContain('Rate Limits');
  });

  it('HTML page contains all major navigation sections', async () => {
    const res = await fetch(`${baseUrl}/docs`, {
      headers: { Accept: 'text/html' },
    });
    const text = await res.text();

    // Core sections must be present
    expect(text).toContain('id="getting-started"');
    expect(text).toContain('id="authentication"');
    expect(text).toContain('id="screenshot-get"');
    expect(text).toContain('id="screenshot-post"');
    expect(text).toContain('id="batch"');
    expect(text).toContain('id="parameters"');
    expect(text).toContain('id="errors"');
    expect(text).toContain('id="rate-limits"');
  });

  it('HTML page includes code examples with tabs', async () => {
    const res = await fetch(`${baseUrl}/docs`, {
      headers: { Accept: 'text/html' },
    });
    const text = await res.text();

    expect(text).toContain('data-lang="curl"');
    expect(text).toContain('data-lang="javascript"');
    expect(text).toContain('data-lang="python"');
    expect(text).toContain('data-lang="nodejs"');
  });

  it('HTML page references docs.js script', async () => {
    const res = await fetch(`${baseUrl}/docs`, {
      headers: { Accept: 'text/html' },
    });
    const text = await res.text();

    expect(text).toContain('/docs.js');
  });
});

// ─── GET /docs/llm ────────────────────────────────────────────────

describe('GET /docs/llm', () => {
  it('returns plain text content type', async () => {
    const res = await fetch(`${baseUrl}/docs/llm`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
  });

  it('contains all endpoint references', async () => {
    const res = await fetch(`${baseUrl}/docs/llm`);
    const text = await res.text();

    expect(text).toContain('GET /screenshot/:tweetIdOrUrl');
    expect(text).toContain('POST /screenshot');
    expect(text).toContain('POST /screenshot/batch');
    expect(text).toContain('GET /tweet/:tweetIdOrUrl');
    expect(text).toContain('GET /demo/screenshot/:tweetIdOrUrl');
    expect(text).toContain('GET /billing/usage');
    expect(text).toContain('POST /billing/signup');
    expect(text).toContain('POST /billing/checkout');
    expect(text).toContain('POST /billing/portal');
  });

  it('contains parameter reference table', async () => {
    const res = await fetch(`${baseUrl}/docs/llm`);
    const text = await res.text();

    expect(text).toContain('RENDER PARAMETERS');
    expect(text).toContain('theme');
    expect(text).toContain('dimension');
    expect(text).toContain('gradient');
    expect(text).toContain('hideMetrics');
    expect(text).toContain('padding');
    expect(text).toContain('fontUrl');
    expect(text).toContain('gradientFrom');
    expect(text).toContain('thread');
  });

  it('contains error code reference', async () => {
    const res = await fetch(`${baseUrl}/docs/llm`);
    const text = await res.text();

    expect(text).toContain('ERROR CODES');
    expect(text).toContain('MISSING_API_KEY');
    expect(text).toContain('INVALID_API_KEY');
    expect(text).toContain('RATE_LIMITED');
    expect(text).toContain('MONTHLY_LIMIT_EXCEEDED');
    expect(text).toContain('RENDER_TIMEOUT');
    expect(text).toContain('VALIDATION_ERROR');
  });

  it('contains tier and rate limit information', async () => {
    const res = await fetch(`${baseUrl}/docs/llm`);
    const text = await res.text();

    expect(text).toContain('TIERS & RATE LIMITS');
    expect(text).toContain('free');
    expect(text).toContain('pro');
    expect(text).toContain('business');
    expect(text).toContain('10 req/min');
    expect(text).toContain('100 req/min');
    expect(text).toContain('1,000 req/min');
  });

  it('does not contain HTML tags', async () => {
    const res = await fetch(`${baseUrl}/docs/llm`);
    const text = await res.text();

    expect(text).not.toMatch(/<html/i);
    expect(text).not.toMatch(/<div/i);
    expect(text).not.toMatch(/<style/i);
  });

  it('contains quick examples with curl commands', async () => {
    const res = await fetch(`${baseUrl}/docs/llm`);
    const text = await res.text();

    expect(text).toContain('QUICK EXAMPLES');
    expect(text).toContain('curl');
    expect(text).toContain('X-API-KEY');
  });

  it('contains authentication section', async () => {
    const res = await fetch(`${baseUrl}/docs/llm`);
    const text = await res.text();

    expect(text).toContain('AUTHENTICATION');
    expect(text).toContain('X-API-KEY');
    expect(text).toContain('apiKey');
  });

  it('contains response headers reference', async () => {
    const res = await fetch(`${baseUrl}/docs/llm`);
    const text = await res.text();

    expect(text).toContain('RESPONSE HEADERS');
    expect(text).toContain('X-Request-ID');
    expect(text).toContain('X-Tweet-ID');
    expect(text).toContain('X-Render-Time-Ms');
    expect(text).toContain('X-Credits-Remaining');
  });
});

// ─── GET /docs.js ────────────────────────────────────────────────

describe('GET /docs.js', () => {
  it('returns JavaScript content', async () => {
    const res = await fetch(`${baseUrl}/docs.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
  });

  it('sets Cache-Control to public, max-age=86400', async () => {
    const res = await fetch(`${baseUrl}/docs.js`);
    expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
  });

  it('contains tab switching and copy-to-clipboard logic', async () => {
    const res = await fetch(`${baseUrl}/docs.js`);
    const text = await res.text();

    expect(text).toContain('data-lang');
    expect(text).toContain('clipboard');
    expect(text).toContain('copy-btn');
  });
});
