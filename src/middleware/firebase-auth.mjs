/**
 * Firebase authentication middleware for dashboard routes.
 * Reads Bearer token from Authorization header, verifies with firebase-admin,
 * attaches decoded user to req.firebaseUser.
 *
 * Separate from API key auth (authenticate.mjs) — different routes, different auth.
 */

import { verifyIdToken } from '../services/firebase-auth.mjs';

export function firebaseAuth(logger) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required. Sign in with Google to access the dashboard.',
        code: 'FIREBASE_AUTH_REQUIRED',
        ...(req.id && { requestId: req.id }),
      });
    }

    const idToken = authHeader.slice(7);
    try {
      const decoded = await verifyIdToken(idToken);

      if (!decoded.email) {
        return res.status(403).json({
          error: 'A Google account with a verified email is required.',
          code: 'EMAIL_REQUIRED',
          ...(req.id && { requestId: req.id }),
        });
      }

      req.firebaseUser = {
        uid: decoded.uid,
        email: decoded.email,
        name: decoded.name || decoded.email,
        emailVerified: decoded.email_verified ?? false,
        picture: decoded.picture || null,
      };

      next();
    } catch (err) {
      logger.warn({ err: err.message, code: err.code }, 'Firebase token verification failed');

      if (err.code === 'auth/id-token-expired') {
        return res.status(401).json({
          error: 'Your session has expired. Please sign in again.',
          code: 'TOKEN_EXPIRED',
          ...(req.id && { requestId: req.id }),
        });
      }

      return res.status(401).json({
        error: 'Invalid authentication token. Please sign in again.',
        code: 'INVALID_TOKEN',
        ...(req.id && { requestId: req.id }),
      });
    }
  };
}
