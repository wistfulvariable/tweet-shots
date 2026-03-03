/**
 * Screenshot routes — GET and POST /screenshot.
 * Full middleware chain: authenticate → rateLimit → billingGuard → validate → handler.
 */

import { Router } from 'express';
import { extractTweetId, fetchTweet } from '../../tweet-fetch.mjs';
import { renderTweetToImage, DIMENSIONS } from '../../tweet-render.mjs';
import { screenshotQuerySchema, screenshotBodySchema } from '../schemas/request-schemas.mjs';
import { validate } from '../middleware/validate.mjs';
import { upload } from '../services/storage.mjs';
import { sendRouteError } from '../errors.mjs';

/**
 * @param {object} deps
 * @param {Function} deps.authenticate - Auth middleware
 * @param {Function} deps.applyRateLimit - Rate limit middleware
 * @param {Function} deps.billingGuard - Credit enforcement middleware
 * @param {Function} [deps.renderPool] - Worker pool (optional; falls back to direct render)
 * @param {object} deps.config - App config
 * @param {object} deps.logger - pino logger
 */
export function screenshotRoutes({ authenticate, applyRateLimit, billingGuard, renderPool, config, logger }) {
  const router = Router();

  /**
   * Build render options from validated params, normalizing both GET query and POST body formats.
   */
  function buildRenderOptions(params) {
    const dimension = params.dimension || 'auto';
    return {
      theme: params.theme || 'dark',
      width: DIMENSIONS[dimension]?.width || 550,
      format: params.format || 'png',
      scale: params.scale ?? 1,
      backgroundGradient: params.gradient || params.backgroundGradient,
      backgroundColor: params.bgColor || params.backgroundColor,
      textColor: params.textColor,
      linkColor: params.linkColor,
      showMetrics: params.showMetrics ?? (params.hideMetrics !== true && params.hideMetrics !== 'true'),
      hideMedia: params.hideMedia === true || params.hideMedia === 'true',
      hideDate: params.hideDate === true || params.hideDate === 'true',
      hideVerified: params.hideVerified === true || params.hideVerified === 'true',
      hideQuoteTweet: params.hideQuoteTweet === true || params.hideQuoteTweet === 'true',
      hideShadow: params.hideShadow === true || params.hideShadow === 'true',
      padding: params.padding ?? 20,
      borderRadius: params.radius ?? params.borderRadius ?? 16,
    };
  }

  /**
   * Render via worker pool or direct call.
   */
  async function render(tweet, options) {
    if (renderPool) {
      return renderPool.render(tweet, options);
    }
    return renderTweetToImage(tweet, options);
  }

  // ─── GET /screenshot/:tweetIdOrUrl ────────────────────────────────
  router.get(
    '/screenshot/:tweetIdOrUrl',
    authenticate,
    applyRateLimit,
    billingGuard,
    validate(screenshotQuerySchema, 'query'),
    async (req, res) => {
      try {
        const tweetId = extractTweetId(decodeURIComponent(req.params.tweetIdOrUrl));
        const tweet = await fetchTweet(tweetId);
        const options = buildRenderOptions(req.validated);
        const result = await render(tweet, options);

        res.set('Content-Type', result.contentType);
        res.set('X-Tweet-ID', tweetId);
        res.set('X-Tweet-Author', tweet.user?.screen_name || 'unknown');
        res.send(result.data);
      } catch (err) {
        logger.error({ err, tweetIdOrUrl: req.params.tweetIdOrUrl }, 'GET screenshot failed');
        sendRouteError(res, err, 'SCREENSHOT_FAILED');
      }
    }
  );

  // ─── POST /screenshot ─────────────────────────────────────────────
  router.post(
    '/screenshot',
    authenticate,
    applyRateLimit,
    billingGuard,
    validate(screenshotBodySchema, 'body'),
    async (req, res) => {
      try {
        const { tweetId: rawId, tweetUrl, response: responseType = 'image', ...rest } = req.validated;
        const tweetId = extractTweetId(rawId || tweetUrl);
        const tweet = await fetchTweet(tweetId);
        const options = buildRenderOptions(rest);
        const result = await render(tweet, options);

        // Base64 response
        if (responseType === 'base64') {
          return res.json({
            success: true,
            tweetId,
            author: tweet.user?.screen_name,
            format: result.format,
            data: result.data.toString('base64'),
          });
        }

        // URL response — upload to Cloud Storage
        if (responseType === 'url') {
          const bucket = config.GCS_BUCKET;
          if (!bucket) {
            return res.status(400).json({ error: 'URL response not configured', code: 'URL_NOT_CONFIGURED' });
          }

          const filename = `screenshots/${tweetId}-${Date.now()}.${result.format}`;
          const publicUrl = await upload(bucket, filename, result.data, result.contentType);

          return res.json({
            success: true,
            tweetId,
            author: tweet.user?.screen_name,
            format: result.format,
            url: publicUrl,
          });
        }

        // Default: return image binary
        res.set('Content-Type', result.contentType);
        res.set('X-Tweet-ID', tweetId);
        res.set('X-Tweet-Author', tweet.user?.screen_name || 'unknown');
        res.send(result.data);
      } catch (err) {
        logger.error({ err }, 'POST screenshot failed');
        sendRouteError(res, err, 'SCREENSHOT_FAILED');
      }
    }
  );

  return router;
}
