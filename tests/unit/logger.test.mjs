/**
 * Unit tests for logger module (src/logger.mjs).
 * Tests production vs development configuration.
 */

import { describe, it, expect, vi } from 'vitest';

// ─── Mock pino ───────────────────────────────────────────────────────────────

const mockPino = vi.fn(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
}));

vi.mock('pino', () => ({ default: mockPino }));

const { createLogger } = await import('../../src/logger.mjs');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createLogger', () => {
  it('creates production logger with JSON format and info level', () => {
    createLogger({ NODE_ENV: 'production' });

    expect(mockPino).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        messageKey: 'message',
      })
    );

    // Should have formatters for GCP severity
    const config = mockPino.mock.calls[mockPino.mock.calls.length - 1][0];
    expect(config.formatters).toBeDefined();
    expect(config.formatters.level('info')).toEqual({ severity: 'INFO' });
    expect(config.formatters.level('error')).toEqual({ severity: 'ERROR' });
  });

  it('creates development logger with pino-pretty and debug level', () => {
    createLogger({ NODE_ENV: 'development' });

    expect(mockPino).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'debug',
        transport: { target: 'pino-pretty' },
      })
    );
  });

  it('treats test environment as non-production (debug level)', () => {
    createLogger({ NODE_ENV: 'test' });

    expect(mockPino).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'debug',
      })
    );
  });

  it('returns a pino instance', () => {
    const logger = createLogger({ NODE_ENV: 'development' });
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });
});
