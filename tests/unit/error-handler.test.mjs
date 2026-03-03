/**
 * Unit tests for error-handler middleware (src/middleware/error-handler.mjs).
 */

import { describe, it, expect, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/error-handler.mjs';

const mockLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

describe('errorHandler', () => {
  function createMockRes() {
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res;
  }

  it('returns 500 with INTERNAL_ERROR code', () => {
    const handler = errorHandler(mockLogger);
    const err = new Error('Something broke');
    const req = { method: 'GET', path: '/test' };
    const res = createMockRes();

    handler(err, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  });

  it('logs error with method and path', () => {
    const handler = errorHandler(mockLogger);
    const err = new Error('Database failed');
    const req = { method: 'POST', path: '/screenshot' };
    const res = createMockRes();

    handler(err, req, res, vi.fn());

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err,
        method: 'POST',
        path: '/screenshot',
      }),
      'Unhandled error'
    );
  });

  it('does not call next', () => {
    const handler = errorHandler(mockLogger);
    const next = vi.fn();
    const res = createMockRes();

    handler(new Error('test'), { method: 'GET', path: '/' }, res, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('handles errors without stack trace', () => {
    const handler = errorHandler(mockLogger);
    const err = { message: 'plain error' };
    const req = { method: 'DELETE', path: '/admin/keys/abc' };
    const res = createMockRes();

    handler(err, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
