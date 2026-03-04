/**
 * Screenshot routes — GET and POST /screenshot.
 * Full middleware chain: authenticate → rateLimit → billingGuard → validate → handler.
 */

import { Router } from 'express';
import Busboy from 'busboy';
import { extractTweetId, fetchTweet } from '../../tweet-fetch.mjs';
import { renderTweetToImage, DIMENSIONS } from '../../tweet-render.mjs';
import { screenshotQuerySchema, screenshotBodySchema, batchScreenshotSchema, batchMultipartOptionsSchema } from '../schemas/request-schemas.mjs';
import { validate } from '../middleware/validate.mjs';
import { upload } from '../services/storage.mjs';
import { checkAndReserveCredits } from '../services/usage.mjs';
import { AppError, sendRouteError } from '../errors.mjs';
import { TIERS, BATCH_CONCURRENCY } from '../config.mjs';

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
    const dim = DIMENSIONS[dimension];

    // Fixed-dimension presets: card stays at readable width, preset sets canvas
    const hasFixedHeight = dim?.height != null;
    const width = hasFixedHeight ? 550 : (dim?.width || 550);
    const canvasWidth = hasFixedHeight ? dim.width : null;
    const canvasHeight = hasFixedHeight ? dim.height : null;

    return {
      theme: params.theme || 'dark',
      width,
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
      showUrl: params.showUrl === true || params.showUrl === 'true',
      padding: params.padding ?? 20,
      borderRadius: params.radius ?? params.borderRadius ?? 16,
      fontFamily: params.fontFamily,
      fontUrl: params.fontUrl,
      fontBoldUrl: params.fontBoldUrl,
      canvasWidth,
      canvasHeight,
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
        const start = Date.now();
        const tweetId = extractTweetId(decodeURIComponent(req.params.tweetIdOrUrl));
        const tweet = await fetchTweet(tweetId);
        const options = { ...buildRenderOptions(req.validated), tweetId };
        const result = await render(tweet, options);

        res.set('Content-Type', result.contentType);
        res.set('X-Tweet-ID', tweetId);
        res.set('X-Tweet-Author', tweet.user?.screen_name || 'unknown');
        res.set('X-Render-Time-Ms', String(Date.now() - start));
        res.send(result.data);
      } catch (err) {
        logger.error({ err, tweetIdOrUrl: req.params.tweetIdOrUrl }, 'GET screenshot failed');
        if (err.message?.includes('timed out')) {
          return res.status(504).json({
            error: 'This tweet took too long to render. Tweets with many large images may exceed the time limit. Try setting hideMedia=true or using a different tweet.',
            code: 'RENDER_TIMEOUT',
            ...(req.id && { requestId: req.id }),
          });
        }
        sendRouteError(res, err, 'SCREENSHOT_FAILED', logger);
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
        const start = Date.now();
        const { tweetId: rawId, tweetUrl, response: responseType = 'image', ...rest } = req.validated;
        const tweetId = extractTweetId(rawId || tweetUrl);
        const tweet = await fetchTweet(tweetId);
        const options = { ...buildRenderOptions(rest), tweetId };
        const result = await render(tweet, options);
        const renderTimeMs = String(Date.now() - start);

        // Base64 response
        if (responseType === 'base64') {
          res.set('X-Render-Time-Ms', renderTimeMs);
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
            return res.status(503).json({ error: 'URL response mode is not available. Use "image" or "base64" response type instead.', code: 'URL_NOT_CONFIGURED' });
          }

          const filename = `screenshots/${tweetId}-${Date.now()}.${result.format}`;
          const publicUrl = await upload(bucket, filename, result.data, result.contentType);

          res.set('X-Render-Time-Ms', renderTimeMs);
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
        res.set('X-Render-Time-Ms', renderTimeMs);
        res.send(result.data);
      } catch (err) {
        logger.error({ err, tweetId: req.validated?.tweetId, tweetUrl: req.validated?.tweetUrl }, 'POST screenshot failed');
        if (err.message?.includes('timed out')) {
          return res.status(504).json({
            error: 'This tweet took too long to render. Tweets with many large images may exceed the time limit. Try setting hideMedia=true or using a different tweet.',
            code: 'RENDER_TIMEOUT',
            ...(req.id && { requestId: req.id }),
          });
        }
        sendRouteError(res, err, 'SCREENSHOT_FAILED', logger);
      }
    }
  );

  // ─── POST /screenshot/batch ──────────────────────────────────────
  router.post(
    '/screenshot/batch',
    authenticate,
    applyRateLimit,
    // billingGuard omitted — batch does its own N-credit check
    async (req, res) => {
      try {
        const start = Date.now();
        let urls, renderParams, responseType;

        // ── Step 1: Parse input (JSON vs multipart) ──
        if (req.is('multipart/form-data')) {
          ({ urls, renderParams } = await parseMultipartBatch(req));
          const optResult = batchMultipartOptionsSchema.safeParse(renderParams);
          if (!optResult.success) {
            return res.status(400).json({
              error: 'Request validation failed. Check the details field for specific issues.',
              code: 'VALIDATION_ERROR',
              details: optResult.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
              ...(req.id && { requestId: req.id }),
            });
          }
          renderParams = optResult.data;
          responseType = renderParams.response;
        } else {
          const bodyResult = batchScreenshotSchema.safeParse(req.body);
          if (!bodyResult.success) {
            return res.status(400).json({
              error: 'Request validation failed. Check the details field for specific issues.',
              code: 'VALIDATION_ERROR',
              details: bodyResult.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
              ...(req.id && { requestId: req.id }),
            });
          }
          const { urls: parsedUrls, response, ...rest } = bodyResult.data;
          urls = parsedUrls;
          renderParams = rest;
          responseType = response;
        }

        // ── Step 2: Enforce batch size limit per tier ──
        const tier = req.keyData.tier;
        const batchLimit = TIERS[tier]?.batchLimit ?? TIERS.free.batchLimit;
        if (urls.length > batchLimit) {
          return res.status(400).json({
            error: `Batch size ${urls.length} exceeds the limit of ${batchLimit} for the ${tier} tier. Reduce the number of URLs or upgrade at /billing/checkout.`,
            code: 'BATCH_LIMIT_EXCEEDED',
            limit: batchLimit,
            tier,
            ...(req.id && { requestId: req.id }),
          });
        }

        // ── Step 3: Check and reserve credits (fail-open) ──
        try {
          const creditResult = await checkAndReserveCredits(req.apiKey, tier, urls.length);
          res.set('X-Credits-Limit', String(creditResult.limit));
          res.set('X-Credits-Remaining', String(creditResult.remaining));

          if (!creditResult.allowed) {
            return res.status(429).json({
              error: creditResult.error,
              code: 'MONTHLY_LIMIT_EXCEEDED',
              limit: creditResult.limit,
              remaining: creditResult.remaining,
              tier: creditResult.tier,
              ...(req.id && { requestId: req.id }),
            });
          }
        } catch (creditErr) {
          logger.error({ err: creditErr, apiKey: req.apiKey.slice(0, 12) + '...' }, 'Batch usage tracking failed — proceeding (fail-open)');
          const tierLimit = TIERS[tier]?.monthlyCredits ?? TIERS.free.monthlyCredits;
          res.set('X-Credits-Limit', String(tierLimit));
          res.set('X-Credits-Remaining', 'unknown');
        }

        // ── Step 4: Build shared render options ──
        const options = buildRenderOptions(renderParams);

        // ── Step 5: Process batch with concurrency control ──
        const results = await processBatch(urls, options, responseType, config);

        // ── Step 6: Return results ──
        const succeeded = results.filter(r => r.success).length;
        const failed = results.length - succeeded;

        res.set('X-Render-Time-Ms', String(Date.now() - start));
        res.json({
          success: true,
          total: results.length,
          succeeded,
          failed,
          results,
        });
      } catch (err) {
        logger.error({ err }, 'POST /screenshot/batch failed');
        sendRouteError(res, err, 'BATCH_SCREENSHOT_FAILED', logger);
      }
    }
  );

  // ─── Batch helpers ──────────────────────────────────────────────────

  /**
   * Parse multipart/form-data: extract CSV file + form fields.
   */
  function parseMultipartBatch(req) {
    return new Promise((resolve, reject) => {
      const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 1_000_000 } });
      let csvBuffer = Buffer.alloc(0);
      let fileReceived = false;
      const fields = {};

      bb.on('file', (fieldname, stream) => {
        if (fieldname !== 'file') {
          stream.resume();
          return;
        }
        fileReceived = true;
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => { csvBuffer = Buffer.concat(chunks); });
      });

      bb.on('field', (name, val) => {
        if (val === 'true') fields[name] = true;
        else if (val === 'false') fields[name] = false;
        else if (/^\d+$/.test(val)) fields[name] = Number(val);
        else fields[name] = val;
      });

      bb.on('close', () => {
        if (!fileReceived) {
          reject(new AppError('CSV file required. Upload a CSV file with a "url" column in the "file" field.'));
          return;
        }
        try {
          const urls = parseCsvUrls(csvBuffer);
          resolve({ urls, renderParams: fields });
        } catch (err) {
          reject(err);
        }
      });

      bb.on('error', (err) => reject(err));
      req.pipe(bb);
    });
  }

  /**
   * Parse CSV buffer into array of URL strings.
   * Expects header row with 'url' column. Handles BOM, CRLF, quoted fields.
   */
  function parseCsvUrls(buffer) {
    let text = buffer.toString('utf-8');
    // Remove BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    // Normalize line endings
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const lines = text.split('\n').filter(line => line.trim().length > 0);
    if (lines.length === 0) {
      throw new AppError('CSV file is empty. Include a header row with a "url" column followed by tweet URLs.');
    }

    // Find url column index from header
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    const urlIndex = headers.indexOf('url');
    if (urlIndex === -1) {
      throw new AppError('CSV file must have a "url" column in the header row.');
    }

    const urls = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const url = cols[urlIndex];
      if (url && url.length > 0) {
        urls.push(url);
      }
    }

    if (urls.length === 0) {
      throw new AppError('No URLs found in CSV file. Ensure the "url" column contains tweet URLs or IDs.');
    }

    return urls;
  }

  /**
   * Process batch of URLs with concurrency control.
   */
  async function processBatch(urls, options, responseType, cfg) {
    const results = new Array(urls.length);
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < urls.length) {
        const idx = nextIndex++;
        results[idx] = await renderSingle(urls[idx], options, responseType, cfg);
      }
    }

    const concurrency = Math.min(urls.length, BATCH_CONCURRENCY);
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return results;
  }

  /**
   * Render a single URL, returning a result object (never throws).
   */
  async function renderSingle(urlOrId, options, responseType, cfg) {
    try {
      const tweetId = extractTweetId(urlOrId);
      const tweet = await fetchTweet(tweetId);
      const result = await render(tweet, { ...options, tweetId });
      const author = tweet.user?.screen_name;

      if (responseType === 'url') {
        const bucket = cfg.GCS_BUCKET;
        if (!bucket) {
          return { tweetId, success: false, error: 'URL response mode is not available.', code: 'URL_NOT_CONFIGURED' };
        }
        const filename = `screenshots/batch/${tweetId}-${Date.now()}.${result.format}`;
        const publicUrl = await upload(bucket, filename, result.data, result.contentType);
        return { tweetId, success: true, url: publicUrl, author, format: result.format };
      }

      return {
        tweetId,
        success: true,
        data: result.data.toString('base64'),
        author,
        format: result.format,
      };
    } catch (err) {
      const tweetId = (() => { try { return extractTweetId(urlOrId); } catch { return urlOrId; } })();
      const isTimeout = err.message?.includes('timed out');
      return {
        tweetId,
        success: false,
        error: isTimeout
          ? 'This tweet took too long to render.'
          : (err instanceof AppError ? err.message : 'Rendering failed for this tweet.'),
        code: isTimeout ? 'RENDER_TIMEOUT' : 'RENDER_FAILED',
      };
    }
  }

  return router;
}
