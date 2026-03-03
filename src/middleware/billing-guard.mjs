/**
 * Monthly credit enforcement middleware.
 * Runs after authenticate, before route handlers.
 * Calls the unified trackAndEnforce() on every request.
 *
 * Fails open: if Firestore is down, requests still proceed (usage not tracked).
 * This prevents a Firestore outage from taking down the entire service.
 */

import { trackAndEnforce } from '../services/usage.mjs';
import { TIERS } from '../config.mjs';

export function billingGuard(logger) {
  return async (req, res, next) => {
    const { apiKey, keyData } = req;

    try {
      const result = await trackAndEnforce(apiKey, keyData.tier);

      // Always set credit headers for client visibility
      res.set('X-Credits-Limit', String(result.limit));
      res.set('X-Credits-Remaining', String(result.remaining));

      if (!result.allowed) {
        return res.status(429).json({
          error: result.error,
          code: 'MONTHLY_LIMIT_EXCEEDED',
          limit: result.limit,
          remaining: 0,
          tier: result.tier,
        });
      }

      next();
    } catch (err) {
      logger.error({ err, apiKey: apiKey.slice(0, 12) + '...' }, 'Usage tracking failed');
      // Fail open — render still works, usage just not tracked
      // Still set headers so clients know tracking was unavailable
      const tierLimit = TIERS[keyData.tier]?.monthlyCredits ?? TIERS.free.monthlyCredits;
      res.set('X-Credits-Limit', String(tierLimit));
      res.set('X-Credits-Remaining', 'unknown');
      next();
    }
  };
}
