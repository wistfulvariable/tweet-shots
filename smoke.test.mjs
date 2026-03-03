/**
 * Smoke tests — fast, shallow checks that the app is alive.
 *
 * Run: node --test smoke.test.mjs
 *
 * These tests cover:
 *   - Core utility functions (no network, no rendering)
 *   - Server startup + /health endpoint
 *   - Auth rejection (no API key → 401)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { extractTweetId, formatNumber, formatDate } from './core.mjs';

// ============================================================================
// UTILITY FUNCTION TESTS (no network, no rendering)
// ============================================================================

test('extractTweetId — passes numeric ID through unchanged', () => {
  assert.equal(extractTweetId('1617979122625712128'), '1617979122625712128');
});

test('extractTweetId — parses twitter.com URL', () => {
  assert.equal(
    extractTweetId('https://twitter.com/karpathy/status/1617979122625712128'),
    '1617979122625712128'
  );
});

test('extractTweetId — parses x.com URL', () => {
  assert.equal(
    extractTweetId('https://x.com/karpathy/status/1617979122625712128'),
    '1617979122625712128'
  );
});

test('extractTweetId — throws on invalid input', () => {
  assert.throws(() => extractTweetId('not-a-tweet'), /Could not extract tweet ID/);
});

test('formatNumber — formats thousands with K suffix', () => {
  assert.equal(formatNumber(1500), '1.5K');
  assert.equal(formatNumber(10000), '10K');
});

test('formatNumber — formats millions with M suffix', () => {
  assert.equal(formatNumber(1500000), '1.5M');
  assert.equal(formatNumber(2000000), '2M');
});

test('formatNumber — passes small numbers through unchanged', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(999), '999');
});

test('formatDate — returns formatted string with time and date', () => {
  const result = formatDate('2024-01-15T14:30:00.000Z');
  assert.match(result, /\d+:\d{2}\s*(AM|PM)\s*·\s*Jan\s+15,\s+2024/i);
});

// ============================================================================
// SERVER SMOKE TESTS
// ============================================================================

/**
 * Starts the Express app on an ephemeral port, runs tests, then closes it.
 * Imports app lazily so Stripe init (which reads env vars) happens in test scope.
 */
async function withServer(testFn) {
  // Import app — this starts the module but we override the listen port
  const { default: app } = await import('./api-server.mjs');

  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', async () => {
      const { port } = server.address();
      try {
        await testFn(`http://127.0.0.1:${port}`);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
    }).on('error', reject);
  });
}

test('GET /health — returns 200 with status ok', async () => {
  await withServer(async (base) => {
    const { status, body } = await get(`${base}/health`);
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.ok(body.timestamp, 'should include timestamp');
  });
});

test('GET /screenshot/:id — returns 401 without API key', async () => {
  await withServer(async (base) => {
    const { status, body } = await get(`${base}/screenshot/1617979122625712128`);
    assert.equal(status, 401);
    assert.equal(body.code, 'MISSING_API_KEY');
  });
});
