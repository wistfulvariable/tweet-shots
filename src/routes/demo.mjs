/**
 * Demo screenshot route — public, no auth, IP-rate-limited.
 * GET /demo/screenshot/:tweetIdOrUrl
 *
 * Reuses the same rendering pipeline as /screenshot but restricted to
 * PNG format, scale 2, and no custom colors — to limit abuse surface.
 */

import { Router } from 'express';
import { extractTweetId, fetchTweet } from '../../tweet-fetch.mjs';
import { renderTweetToImage, DIMENSIONS } from '../../tweet-render.mjs';
import { demoQuerySchema } from '../schemas/request-schemas.mjs';
import { validate } from '../middleware/validate.mjs';
import { sendRouteError } from '../errors.mjs';

/**
 * @param {object} deps
 * @param {Function} deps.demoRateLimit - IP-based rate limiter middleware
 * @param {object} [deps.renderPool] - Worker pool (optional; falls back to direct render)
 * @param {object} deps.logger - pino logger
 */
export function demoRoutes({ demoRateLimit, renderPool, logger }) {
  const router = Router();

  function buildDemoRenderOptions(params) {
    const dimension = params.dimension || 'auto';
    const dim = DIMENSIONS[dimension];

    const hasFixedHeight = dim?.height != null;
    const width = hasFixedHeight ? 550 : (dim?.width || 550);
    const canvasWidth = hasFixedHeight ? dim.width : null;
    const canvasHeight = hasFixedHeight ? dim.height : null;

    return {
      theme: params.theme || 'dark',
      width,
      format: 'png',
      scale: 2,
      backgroundGradient: params.gradient,
      showMetrics: params.hideMetrics !== true,
      hideMedia: params.hideMedia === true,
      hideDate: params.hideDate === true,
      hideVerified: params.hideVerified === true,
      hideQuoteTweet: params.hideQuoteTweet === true,
      hideShadow: params.hideShadow === true,
      showUrl: params.showUrl === true,
      padding: params.padding ?? 20,
      borderRadius: params.radius ?? 16,
      canvasWidth,
      canvasHeight,
    };
  }

  async function render(tweet, options) {
    if (renderPool) return renderPool.render(tweet, options);
    return renderTweetToImage(tweet, options);
  }

  router.get(
    '/demo/screenshot/:tweetIdOrUrl',
    demoRateLimit,
    validate(demoQuerySchema, 'query'),
    async (req, res) => {
      try {
        const start = Date.now();
        const tweetId = extractTweetId(decodeURIComponent(req.params.tweetIdOrUrl));
        const tweet = await fetchTweet(tweetId);
        const options = { ...buildDemoRenderOptions(req.validated), tweetId };
        const result = await render(tweet, options);

        res.set('Content-Type', result.contentType);
        res.set('Cache-Control', 'public, max-age=300');
        res.set('X-Tweet-ID', tweetId);
        res.set('X-Render-Time-Ms', String(Date.now() - start));
        res.send(result.data);
      } catch (err) {
        logger.warn({ err, tweetIdOrUrl: req.params.tweetIdOrUrl }, 'Demo screenshot failed');
        if (err.message?.includes('timed out')) {
          return res.status(504).json({
            error: 'This tweet took too long to render. Tweets with many large images may exceed the time limit. Try checking "Hide media" or using a different tweet.',
            code: 'RENDER_TIMEOUT',
          });
        }
        sendRouteError(res, err, 'DEMO_SCREENSHOT_FAILED', logger);
      }
    }
  );

  return router;
}
