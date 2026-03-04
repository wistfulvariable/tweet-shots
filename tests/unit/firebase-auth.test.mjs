/**
 * Unit tests for Firebase authentication middleware.
 * Mocks verifyIdToken to test all auth scenarios.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase-auth service before importing middleware
vi.mock('../../src/services/firebase-auth.mjs', () => ({
  verifyIdToken: vi.fn(),
}));

const { verifyIdToken } = await import('../../src/services/firebase-auth.mjs');
const { firebaseAuth } = await import('../../src/middleware/firebase-auth.mjs');

const MOCK_DECODED_TOKEN = {
  uid: 'firebase-uid-abc123',
  email: 'test@example.com',
  name: 'Test User',
  email_verified: true,
  picture: 'https://lh3.googleusercontent.com/photo.jpg',
};

function createMockReqRes(headers = {}) {
  const req = {
    headers,
    id: 'req-123',
  };
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  return { req, res, next };
}

const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };

describe('firebaseAuth middleware', () => {
  let middleware;

  beforeEach(() => {
    vi.clearAllMocks();
    middleware = firebaseAuth(logger);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const { req, res, next } = createMockReqRes({});

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'FIREBASE_AUTH_REQUIRED',
      requestId: 'req-123',
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization header is not Bearer format', async () => {
    const { req, res, next } = createMockReqRes({ authorization: 'Basic abc123' });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'FIREBASE_AUTH_REQUIRED',
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token verification fails (invalid token)', async () => {
    verifyIdToken.mockRejectedValue(new Error('Decoding Firebase ID token failed'));
    const { req, res, next } = createMockReqRes({ authorization: 'Bearer bad-token' });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'INVALID_TOKEN',
      requestId: 'req-123',
    }));
    expect(logger.warn).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with TOKEN_EXPIRED code for expired tokens', async () => {
    const expiredError = new Error('Firebase ID token has expired');
    expiredError.code = 'auth/id-token-expired';
    verifyIdToken.mockRejectedValue(expiredError);
    const { req, res, next } = createMockReqRes({ authorization: 'Bearer expired-token' });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'TOKEN_EXPIRED',
      error: 'Your session has expired. Please sign in again.',
    }));
  });

  it('returns 403 when decoded token has no email', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'uid-123', email: null });
    const { req, res, next } = createMockReqRes({ authorization: 'Bearer no-email-token' });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'EMAIL_REQUIRED',
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when email is undefined', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'uid-123' });
    const { req, res, next } = createMockReqRes({ authorization: 'Bearer no-email-token' });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'EMAIL_REQUIRED',
    }));
  });

  it('attaches req.firebaseUser with uid, email, name, picture on success', async () => {
    verifyIdToken.mockResolvedValue(MOCK_DECODED_TOKEN);
    const { req, res, next } = createMockReqRes({ authorization: 'Bearer valid-token' });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.firebaseUser).toEqual({
      uid: 'firebase-uid-abc123',
      email: 'test@example.com',
      name: 'Test User',
      emailVerified: true,
      picture: 'https://lh3.googleusercontent.com/photo.jpg',
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('falls back name to email when name is missing in decoded token', async () => {
    verifyIdToken.mockResolvedValue({
      uid: 'uid-456',
      email: 'noname@example.com',
      email_verified: true,
    });
    const { req, res, next } = createMockReqRes({ authorization: 'Bearer valid-token' });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.firebaseUser.name).toBe('noname@example.com');
    expect(req.firebaseUser.picture).toBeNull();
    expect(req.firebaseUser.emailVerified).toBe(true);
  });

  it('handles missing email_verified by defaulting to false', async () => {
    verifyIdToken.mockResolvedValue({
      uid: 'uid-789',
      email: 'test@example.com',
      name: 'Test',
    });
    const { req, res, next } = createMockReqRes({ authorization: 'Bearer valid-token' });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.firebaseUser.emailVerified).toBe(false);
  });

  it('omits requestId from error response when req.id is not set', async () => {
    const { req, res, next } = createMockReqRes({});
    delete req.id;

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg).not.toHaveProperty('requestId');
  });

  it('passes the token string from the header to verifyIdToken', async () => {
    verifyIdToken.mockResolvedValue(MOCK_DECODED_TOKEN);
    const { req, res, next } = createMockReqRes({ authorization: 'Bearer my-specific-token-123' });

    await middleware(req, res, next);

    expect(verifyIdToken).toHaveBeenCalledWith('my-specific-token-123');
  });
});
