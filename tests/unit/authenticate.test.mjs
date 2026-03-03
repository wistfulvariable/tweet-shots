/**
 * Unit tests for authentication middleware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MOCK_KEY_DATA, MOCK_API_KEY } from '../helpers/test-fixtures.mjs';

// Mock the api-keys service
vi.mock('../../src/services/api-keys.mjs', () => ({
  validateApiKey: vi.fn(),
}));

const { validateApiKey } = await import('../../src/services/api-keys.mjs');
const { authenticate } = await import('../../src/middleware/authenticate.mjs');

const mockLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

function createMockReqRes(headers = {}, query = {}) {
  const req = { headers, query };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('authenticate middleware', () => {
  const middleware = authenticate(mockLogger);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no API key provided', async () => {
    const { req, res, next } = createMockReqRes();
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'MISSING_API_KEY' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts API key from X-API-KEY header', async () => {
    validateApiKey.mockResolvedValueOnce(MOCK_KEY_DATA);
    const { req, res, next } = createMockReqRes({ 'x-api-key': MOCK_API_KEY });

    await middleware(req, res, next);

    expect(validateApiKey).toHaveBeenCalledWith(MOCK_API_KEY);
    expect(req.apiKey).toBe(MOCK_API_KEY);
    expect(req.keyData).toEqual(MOCK_KEY_DATA);
    expect(next).toHaveBeenCalled();
  });

  it('accepts API key from query param', async () => {
    validateApiKey.mockResolvedValueOnce(MOCK_KEY_DATA);
    const { req, res, next } = createMockReqRes({}, { apiKey: MOCK_API_KEY });

    await middleware(req, res, next);

    expect(req.apiKey).toBe(MOCK_API_KEY);
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 for invalid API key', async () => {
    validateApiKey.mockResolvedValueOnce(null);
    const { req, res, next } = createMockReqRes({ 'x-api-key': 'ts_free_invalid' });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_API_KEY' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 on Firestore error', async () => {
    validateApiKey.mockRejectedValueOnce(new Error('Firestore unavailable'));
    const { req, res, next } = createMockReqRes({ 'x-api-key': MOCK_API_KEY });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AUTH_ERROR' })
    );
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('prefers header over query param', async () => {
    validateApiKey.mockResolvedValueOnce(MOCK_KEY_DATA);
    const { req, res, next } = createMockReqRes(
      { 'x-api-key': 'ts_free_header' },
      { apiKey: 'ts_free_query' }
    );

    await middleware(req, res, next);

    expect(validateApiKey).toHaveBeenCalledWith('ts_free_header');
  });
});
