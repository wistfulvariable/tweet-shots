/**
 * Unit tests for AppError class (src/errors.mjs).
 */

import { describe, it, expect } from 'vitest';
import { AppError } from '../../src/errors.mjs';

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
