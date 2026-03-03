/**
 * Unit tests for billing guard middleware.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/usage.mjs', () => ({
  trackAndEnforce: vi.fn(),
}));

const { trackAndEnforce } = await import('../../src/services/usage.mjs');
const { billingGuard } = await import('../../src/middleware/billing-guard.mjs');

const mockLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

function createMockReqRes() {
  const req = {
    apiKey: 'ts_free_test123',
    keyData: { tier: 'free' },
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    set: vi.fn(),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('billingGuard middleware', () => {
  const middleware = billingGuard(mockLogger);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls next and sets credit headers when under limit', async () => {
    trackAndEnforce.mockResolvedValueOnce({
      allowed: true,
      remaining: 40,
      limit: 50,
      tier: 'free',
    });

    const { req, res, next } = createMockReqRes();
    await middleware(req, res, next);

    expect(res.set).toHaveBeenCalledWith('X-Credits-Limit', '50');
    expect(res.set).toHaveBeenCalledWith('X-Credits-Remaining', '40');
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 429 when monthly limit exceeded', async () => {
    trackAndEnforce.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      limit: 50,
      tier: 'free',
      error: 'Monthly credit limit reached.',
    });

    const { req, res, next } = createMockReqRes();
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'MONTHLY_LIMIT_EXCEEDED',
        limit: 50,
        remaining: 0,
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('fails open when Firestore throws', async () => {
    trackAndEnforce.mockRejectedValueOnce(new Error('Firestore down'));

    const { req, res, next } = createMockReqRes();
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('sets headers even when at limit', async () => {
    trackAndEnforce.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      limit: 50,
      tier: 'free',
      error: 'Limit reached',
    });

    const { req, res, next } = createMockReqRes();
    await middleware(req, res, next);

    expect(res.set).toHaveBeenCalledWith('X-Credits-Limit', '50');
    expect(res.set).toHaveBeenCalledWith('X-Credits-Remaining', '0');
  });

  it('passes correct parameters to trackAndEnforce', async () => {
    trackAndEnforce.mockResolvedValueOnce({
      allowed: true, remaining: 999, limit: 1000, tier: 'pro',
    });

    const { req, res, next } = createMockReqRes();
    req.apiKey = 'ts_pro_mykey';
    req.keyData = { tier: 'pro' };

    await middleware(req, res, next);

    expect(trackAndEnforce).toHaveBeenCalledWith('ts_pro_mykey', 'pro');
  });
});
