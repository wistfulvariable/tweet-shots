/**
 * Unit tests for validation middleware.
 */

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validate } from '../../src/middleware/validate.mjs';

function createMockReqRes(body = {}, query = {}) {
  const req = { body, query };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('validate middleware', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().min(0),
  });

  it('passes valid body and sets req.validated', () => {
    const middleware = validate(schema, 'body');
    const { req, res, next } = createMockReqRes({ name: 'Alice', age: 25 });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validated).toEqual({ name: 'Alice', age: 25 });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 400 on validation failure', () => {
    const middleware = validate(schema, 'body');
    const { req, res, next } = createMockReqRes({ name: '', age: -1 });

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Request validation failed. Check the details field for specific issues.',
        code: 'VALIDATION_ERROR',
        details: expect.any(Array),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('includes field-level error details', () => {
    const middleware = validate(schema, 'body');
    const { req, res, next } = createMockReqRes({ name: '', age: 'not-a-number' });

    middleware(req, res, next);

    const response = res.json.mock.calls[0][0];
    expect(response.details.length).toBeGreaterThan(0);
    expect(response.details[0]).toHaveProperty('field');
    expect(response.details[0]).toHaveProperty('message');
  });

  it('validates query params when source is query', () => {
    const querySchema = z.object({ page: z.coerce.number().int().min(1) });
    const middleware = validate(querySchema, 'query');
    const { req, res, next } = createMockReqRes({}, { page: '3' });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validated).toEqual({ page: 3 });
  });

  it('defaults to body validation', () => {
    const middleware = validate(schema);
    const { req, res, next } = createMockReqRes({ name: 'Bob', age: 30 });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validated).toEqual({ name: 'Bob', age: 30 });
  });

  it('includes requestId in validation error when req.id is set', () => {
    const middleware = validate(schema, 'body');
    const { req, res, next } = createMockReqRes({ name: '', age: -1 });
    req.id = 'test-request-id-123';

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const response = res.json.mock.calls[0][0];
    expect(response.requestId).toBe('test-request-id-123');
  });

  it('omits requestId from validation error when req.id is not set', () => {
    const middleware = validate(schema, 'body');
    const { req, res, next } = createMockReqRes({ name: '', age: -1 });

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const response = res.json.mock.calls[0][0];
    expect(response).not.toHaveProperty('requestId');
  });
});
