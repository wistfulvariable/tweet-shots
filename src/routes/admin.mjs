/**
 * Admin routes — API key CRUD.
 * Protected by X-Admin-Key header.
 */

import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { createApiKey, revokeApiKey, listApiKeys } from '../services/api-keys.mjs';
import { getUsageStats } from '../services/usage.mjs';
import { createKeySchema } from '../schemas/request-schemas.mjs';
import { validate } from '../middleware/validate.mjs';

/**
 * @param {object} deps
 * @param {object} deps.config - App config (needs ADMIN_KEY)
 * @param {object} deps.logger
 */
export function adminRoutes({ config, logger }) {
  const router = Router();

  // Admin auth — all routes in this router require X-Admin-Key
  // Uses constant-time comparison to prevent timing attacks
  router.use((req, res, next) => {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || typeof adminKey !== 'string') {
      return res.status(403).json({ error: 'Admin access denied', code: 'ADMIN_DENIED' });
    }
    const a = Buffer.from(adminKey);
    const b = Buffer.from(config.ADMIN_KEY);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(403).json({ error: 'Admin access denied', code: 'ADMIN_DENIED' });
    }
    next();
  });

  // Create API key
  router.post('/admin/keys', validate(createKeySchema, 'body'), async (req, res) => {
    try {
      const { tier, name } = req.validated;
      const result = await createApiKey({ tier, name });

      logger.info({ tier, name: result.name }, 'Admin created API key');
      res.status(201).json({ success: true, apiKey: result.keyString, tier: result.tier, name: result.name });
    } catch (err) {
      logger.error({ err }, 'Admin key creation failed');
      res.status(500).json({ error: 'Failed to create key', code: 'KEY_CREATE_FAILED' });
    }
  });

  // List API keys (strip internal _id from response)
  router.get('/admin/keys', async (req, res) => {
    try {
      const keys = (await listApiKeys()).map(({ _id, ...rest }) => rest);
      res.json({ keys });
    } catch (err) {
      logger.error({ err }, 'Admin key listing failed');
      res.status(500).json({ error: 'Failed to list keys', code: 'KEY_LIST_FAILED' });
    }
  });

  // Revoke API key
  router.delete('/admin/keys/:key', async (req, res) => {
    try {
      const revoked = await revokeApiKey(req.params.key);
      if (!revoked) {
        return res.status(404).json({ error: 'Key not found', code: 'KEY_NOT_FOUND' });
      }

      logger.info({ key: req.params.key.slice(0, 12) + '...' }, 'Admin revoked API key');
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, 'Admin key revocation failed');
      res.status(500).json({ error: 'Failed to revoke key', code: 'KEY_REVOKE_FAILED' });
    }
  });

  // Usage stats
  router.get('/admin/usage', async (req, res) => {
    try {
      const keys = await listApiKeys();
      const stats = await Promise.all(
        keys.map(async ({ _id, ...keyData }) => {
          const usage = await getUsageStats(_id, keyData.tier);
          return { ...keyData, usage };
        })
      );
      res.json({ stats });
    } catch (err) {
      logger.error({ err }, 'Admin usage stats failed');
      res.status(500).json({ error: 'Failed to get usage stats', code: 'USAGE_STATS_FAILED' });
    }
  });

  return router;
}
