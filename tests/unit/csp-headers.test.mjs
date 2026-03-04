/**
 * Unit tests for Content Security Policy headers.
 *
 * Verifies helmet CSP is configured correctly with the directives
 * needed for dashboard (Firebase SDK), landing page (blob URLs),
 * and docs (inline styles).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import helmet from 'helmet';

// ─── Test Setup ─────────────────────────────────────────────────────────────

function createTestApp() {
  const app = express();

  // Same helmet config as server.mjs
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://www.gstatic.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://lh3.googleusercontent.com'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'", 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com'],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  }));

  app.get('/test', (req, res) => res.json({ ok: true }));
  app.get('/html', (req, res) => res.type('html').send('<html><body>test</body></html>'));

  return app;
}

let app, server, baseUrl;

beforeAll(async () => {
  app = createTestApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

afterAll(() => { server?.close(); });

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CSP Headers', () => {
  it('responses include content-security-policy header', async () => {
    const res = await fetch(`${baseUrl}/test`);
    const csp = res.headers.get('content-security-policy');
    expect(csp).toBeTruthy();
  });

  it('allows scripts from self and gstatic.com (Firebase SDK)', async () => {
    const res = await fetch(`${baseUrl}/test`);
    const csp = res.headers.get('content-security-policy');
    expect(csp).toContain("script-src 'self' https://www.gstatic.com");
  });

  it('allows inline styles (all pages use inline CSS)', async () => {
    const res = await fetch(`${baseUrl}/test`);
    const csp = res.headers.get('content-security-policy');
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('allows images from self, data URIs, blob URLs, and Google avatars', async () => {
    const res = await fetch(`${baseUrl}/test`);
    const csp = res.headers.get('content-security-policy');
    expect(csp).toContain('img-src');
    expect(csp).toContain("'self'");
    expect(csp).toContain('data:');
    expect(csp).toContain('blob:');
    expect(csp).toContain('https://lh3.googleusercontent.com');
  });

  it('allows connections to Firebase Auth APIs', async () => {
    const res = await fetch(`${baseUrl}/test`);
    const csp = res.headers.get('content-security-policy');
    expect(csp).toContain('https://identitytoolkit.googleapis.com');
    expect(csp).toContain('https://securetoken.googleapis.com');
  });

  it('prevents framing (clickjacking protection)', async () => {
    const res = await fetch(`${baseUrl}/test`);
    const csp = res.headers.get('content-security-policy');
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('restricts base-uri and form-action to self', async () => {
    const res = await fetch(`${baseUrl}/test`);
    const csp = res.headers.get('content-security-policy');
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it('restricts fonts to self only', async () => {
    const res = await fetch(`${baseUrl}/test`);
    const csp = res.headers.get('content-security-policy');
    expect(csp).toContain("font-src 'self'");
  });

  it('CSP header is present on HTML responses too', async () => {
    const res = await fetch(`${baseUrl}/html`);
    const csp = res.headers.get('content-security-policy');
    expect(csp).toBeTruthy();
  });
});
