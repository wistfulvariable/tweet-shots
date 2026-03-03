/**
 * API key authentication middleware.
 * Reads key from X-API-KEY header or apiKey query param,
 * validates against Firestore, and attaches key data to the request.
 */

import { validateApiKey } from '../services/api-keys.mjs';

export function authenticate(logger) {
  return async (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!apiKey) {
      logger.warn({ method: req.method, path: req.path, ip: req.ip }, 'Auth failed: missing API key');
      return res.status(401).json({ error: 'API key required. Include it in the X-API-KEY header or apiKey query parameter.', code: 'MISSING_API_KEY' });
    }

    try {
      const keyData = await validateApiKey(apiKey);
      if (!keyData) {
        logger.warn({ method: req.method, path: req.path, keyPrefix: apiKey.slice(0, 12) }, 'Auth failed: invalid or revoked key');
        return res.status(401).json({ error: 'Invalid or revoked API key. Sign up at /billing/signup for a new key.', code: 'INVALID_API_KEY' });
      }

      req.apiKey = apiKey;
      req.keyData = keyData;
      next();
    } catch (err) {
      logger.error({ err, apiKey: apiKey.slice(0, 12) + '...' }, 'Auth lookup failed');
      res.status(500).json({ error: 'Authentication service is temporarily unavailable. Please try again later.', code: 'AUTH_ERROR' });
    }
  };
}
