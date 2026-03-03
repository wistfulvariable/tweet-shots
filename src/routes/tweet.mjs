/**
 * Tweet data route — GET /tweet/:tweetIdOrUrl.
 * Returns raw tweet JSON from the syndication API.
 */

import { Router } from 'express';
import { extractTweetId, fetchTweet } from '../../core.mjs';
import { AppError } from '../errors.mjs';

/**
 * @param {object} deps
 * @param {Function} deps.authenticate
 * @param {Function} deps.applyRateLimit
 * @param {Function} deps.billingGuard
 * @param {object} deps.logger
 */
export function tweetRoutes({ authenticate, applyRateLimit, billingGuard, logger }) {
  const router = Router();

  router.get('/tweet/:tweetIdOrUrl', authenticate, applyRateLimit, billingGuard, async (req, res) => {
    try {
      const tweetId = extractTweetId(decodeURIComponent(req.params.tweetIdOrUrl));
      const tweet = await fetchTweet(tweetId);

      res.json({ success: true, tweetId, data: tweet });
    } catch (err) {
      logger.error({ err, tweetIdOrUrl: req.params.tweetIdOrUrl }, 'Tweet fetch failed');
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({
        error: status >= 500 ? 'Internal server error' : err.message,
        code: 'FETCH_FAILED',
      });
    }
  });

  return router;
}
