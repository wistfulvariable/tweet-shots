/**
 * Unit tests for AppError class and sendRouteError helper (src/errors.mjs).
 */

import { describe, it, expect, vi } from 'vitest';
import { AppError, sendRouteError } from '../../src/errors.mjs';

describe('AppError', () => {
  it('is an instance of Error', () => {
    const err = new AppError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('sets message and default statusCode 400', () => {
    const err = new AppError('Bad input');
    expect(err.message).toBe('Bad input');
    expect(err.statusCode).toBe(400);
  });

  it('accepts a custom statusCode', () => {
    const err = new AppError('Not found', 404);
    expect(err.statusCode).toBe(404);
  });

  it('sets name to AppError', () => {
    const err = new AppError('test');
    expect(err.name).toBe('AppError');
  });

  it('accepts optional error code', () => {
    const err = new AppError('test', 400, 'INVALID_INPUT');
    expect(err.code).toBe('INVALID_INPUT');
  });

  it('omits code when not provided', () => {
    const err = new AppError('test');
    expect(err.code).toBeUndefined();
  });

  it('has a stack trace', () => {
    const err = new AppError('test');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('AppError');
  });
});

describe('sendRouteError', () => {
  function createMockRes() {
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    return res;
  }

  it('returns AppError statusCode and message for client errors', () => {
    const res = createMockRes();
    const err = new AppError('Tweet not found', 404);

    sendRouteError(res, err, 'FETCH_FAILED');

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Tweet not found',
      code: 'FETCH_FAILED',
    });
  });

  it('returns 500 with generic message for plain Error', () => {
    const res = createMockRes();
    const err = new Error('Firestore timeout');

    sendRouteError(res, err, 'SCREENSHOT_FAILED');

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      code: 'SCREENSHOT_FAILED',
    });
  });

  it('returns 500 with generic message for AppError with statusCode >= 500', () => {
    const res = createMockRes();
    const err = new AppError('Service unavailable', 503);

    sendRouteError(res, err, 'RENDER_FAILED');

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Internal server error',
      code: 'RENDER_FAILED',
    });
  });

  it('uses the provided error code in the response', () => {
    const res = createMockRes();
    const err = new AppError('Bad input', 400);

    sendRouteError(res, err, 'CUSTOM_CODE');

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CUSTOM_CODE' }),
    );
  });
});
