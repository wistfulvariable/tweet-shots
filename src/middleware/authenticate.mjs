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
      return res.status(401).json({ error: 'API key required', code: 'MISSING_API_KEY' });
    }

    try {
      const keyData = await validateApiKey(apiKey);
      if (!keyData) {
        return res.status(401).json({ error: 'Invalid or revoked API key', code: 'INVALID_API_KEY' });
      }

      req.apiKey = apiKey;
      req.keyData = keyData;
      next();
    } catch (err) {
      logger.error({ err, apiKey: apiKey.slice(0, 12) + '...' }, 'Auth lookup failed');
      res.status(500).json({ error: 'Authentication service unavailable', code: 'AUTH_ERROR' });
    }
  };
}
