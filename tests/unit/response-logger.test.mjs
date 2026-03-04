/**
 * Unit tests for response-complete logging middleware.
 *
 * Verifies the middleware logs request completion with correct level,
 * status, duration, and render time metadata.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { randomUUID } from 'crypto';

// ─── Test Setup ─────────────────────────────────────────────────────────────

const mockLogger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(function () { return this; }),
};

function createTestApp() {
  const app = express();

  // Request ID + child logger (mirrors server.mjs)
  app.use((req, res, next) => {
    req.id = randomUUID();
    req.log = mockLogger;
    next();
  });

  // Response-complete logging (same as server.mjs)
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      if (req.path === '/health') return;
      const durationMs = Date.now() - start;
      const data = { method: req.method, path: req.path, status: res.statusCode, durationMs };
      const renderTime = res.getHeader('X-Render-Time-Ms');
      if (renderTime) data.renderTimeMs = Number(renderTime);
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      req.log[level](data, 'response');
    });
    next();
  });

  // Test routes
  app.get('/ok', (req, res) => res.json({ ok: true }));
  app.get('/not-found', (req, res) => res.status(404).json({ error: 'not found' }));
  app.get('/server-error', (req, res) => res.status(500).json({ error: 'boom' }));
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/with-render-time', (req, res) => {
    res.set('X-Render-Time-Ms', '1250');
    res.json({ ok: true });
  });

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

describe('Response Logger Middleware', () => {
  it('logs 200 responses at info level', async () => {
    mockLogger.info.mockClear();
    await fetch(`${baseUrl}/ok`);

    expect(mockLogger.info).toHaveBeenCalled();
    const call = mockLogger.info.mock.calls.find(c => c[1] === 'response');
    expect(call).toBeDefined();
    expect(call[0].method).toBe('GET');
    expect(call[0].path).toBe('/ok');
    expect(call[0].status).toBe(200);
    expect(call[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('logs 404 responses at warn level', async () => {
    mockLogger.warn.mockClear();
    await fetch(`${baseUrl}/not-found`);

    expect(mockLogger.warn).toHaveBeenCalled();
    const call = mockLogger.warn.mock.calls.find(c => c[1] === 'response');
    expect(call).toBeDefined();
    expect(call[0].status).toBe(404);
  });

  it('logs 500 responses at error level', async () => {
    mockLogger.error.mockClear();
    await fetch(`${baseUrl}/server-error`);

    expect(mockLogger.error).toHaveBeenCalled();
    const call = mockLogger.error.mock.calls.find(c => c[1] === 'response');
    expect(call).toBeDefined();
    expect(call[0].status).toBe(500);
  });

  it('skips /health to reduce noise', async () => {
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();

    await fetch(`${baseUrl}/health`);

    const allCalls = [
      ...mockLogger.info.mock.calls,
      ...mockLogger.warn.mock.calls,
      ...mockLogger.error.mock.calls,
    ];
    const responseCalls = allCalls.filter(c => c[1] === 'response');
    expect(responseCalls).toHaveLength(0);
  });

  it('includes durationMs as a non-negative number', async () => {
    mockLogger.info.mockClear();
    await fetch(`${baseUrl}/ok`);

    const call = mockLogger.info.mock.calls.find(c => c[1] === 'response');
    expect(call[0].durationMs).toBeTypeOf('number');
    expect(call[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('includes renderTimeMs when X-Render-Time-Ms header is set', async () => {
    mockLogger.info.mockClear();
    await fetch(`${baseUrl}/with-render-time`);

    const call = mockLogger.info.mock.calls.find(c => c[1] === 'response');
    expect(call).toBeDefined();
    expect(call[0].renderTimeMs).toBe(1250);
  });

  it('omits renderTimeMs when X-Render-Time-Ms header is absent', async () => {
    mockLogger.info.mockClear();
    await fetch(`${baseUrl}/ok`);

    const call = mockLogger.info.mock.calls.find(c => c[1] === 'response');
    expect(call).toBeDefined();
    expect(call[0]).not.toHaveProperty('renderTimeMs');
  });
});
