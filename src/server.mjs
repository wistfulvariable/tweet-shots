/**
 * tweet-shots API Server (v2)
 *
 * Modular Express app with Firestore-backed auth, billing, and rate limiting.
 * Replaces the monolithic api-server.mjs.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'crypto';

import { loadConfig, TIERS } from './config.mjs';
import { createLogger } from './logger.mjs';

// Middleware
import { authenticate } from './middleware/authenticate.mjs';
import { firebaseAuth } from './middleware/firebase-auth.mjs';
import { applyRateLimit, demoLimiter } from './middleware/rate-limit.mjs';
import { billingGuard } from './middleware/billing-guard.mjs';
import { errorHandler } from './middleware/error-handler.mjs';

// Routes
import { healthRoutes } from './routes/health.mjs';
import { landingRoutes } from './routes/landing.mjs';
import { screenshotRoutes } from './routes/screenshot.mjs';
import { tweetRoutes } from './routes/tweet.mjs';
import { adminRoutes } from './routes/admin.mjs';
import { billingRoutes } from './routes/billing.mjs';
import { demoRoutes } from './routes/demo.mjs';
import { dashboardRoutes } from './routes/dashboard.mjs';

// Workers
import { createRenderPool } from './workers/render-pool.mjs';

// ─── Bootstrap ──────────────────────────────────────────────────────

const config = loadConfig();
const logger = createLogger(config);

// Create worker pool for rendering (skip in test env)
const renderPool = config.NODE_ENV !== 'test' ? createRenderPool({ logger }) : null;

const app = express();

// ─── Global middleware ──────────────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());

// Raw body for Stripe webhook signature verification — must run before express.json()
app.use((req, res, next) => {
  if (req.path === '/webhook/stripe') {
    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk; });
    req.on('error', (err) => {
      logger.error({ err, path: req.path }, 'Webhook raw body stream error');
      res.status(400).json({ error: 'Request body could not be read. Please retry.', code: 'STREAM_ERROR' });
    });
    req.on('end', () => {
      req.rawBody = rawBody;
      try {
        req.body = JSON.parse(rawBody || '{}');
      } catch (e) {
        logger.warn({ err: e.message, bodyLength: rawBody.length }, 'Webhook body JSON parse failed — proceeding with empty body');
        req.body = {};
      }
      next();
    });
  } else {
    express.json()(req, res, next);
  }
});

// Request ID + structured logging per request
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.set('X-Request-ID', req.id);
  req.log = logger.child({ reqId: req.id });
  req.log.info({ method: req.method, path: req.path }, 'request');
  next();
});

// ─── Build dependency-injected middleware ────────────────────────────

const authMiddleware = authenticate(logger);
const firebaseAuthMiddleware = firebaseAuth(logger);
const billingMiddleware = billingGuard(logger);

// ─── Mount routes ───────────────────────────────────────────────────

// Public (no auth)
app.use(landingRoutes());
app.use(healthRoutes());
app.use(demoRoutes({
  demoRateLimit: demoLimiter(),
  renderPool,
  logger,
}));

// Dashboard (public HTML page + Firebase-authed API)
app.use(dashboardRoutes({
  firebaseAuth: firebaseAuthMiddleware,
  config,
  logger,
}));

// Authenticated API routes
app.use(screenshotRoutes({
  authenticate: authMiddleware,
  applyRateLimit,
  billingGuard: billingMiddleware,
  renderPool,
  config,
  logger,
}));

app.use(tweetRoutes({
  authenticate: authMiddleware,
  applyRateLimit,
  billingGuard: billingMiddleware,
  logger,
}));

// Billing routes (signup, checkout, portal, usage, webhooks)
// Must be mounted BEFORE admin — admin's router.use() guard blocks
// all requests without X-Admin-Key, including /billing/* paths.
app.use(billingRoutes({ authenticate: authMiddleware, config, logger }));

// Admin routes (router-level X-Admin-Key guard)
app.use(adminRoutes({ config, logger }));

// ─── Error handler (must be last) ───────────────────────────────────

app.use(errorHandler(logger));

// ─── Start server ───────────────────────────────────────────────────

const server = app.listen(config.PORT, config.HOST, () => {
  logger.info({
    port: config.PORT,
    host: config.HOST,
    env: config.NODE_ENV,
    stripeEnabled: !!config.STRIPE_SECRET_KEY,
    dashboardEnabled: !!(config.FIREBASE_WEB_API_KEY && config.FIREBASE_AUTH_DOMAIN),
    tiers: Object.keys(TIERS),
  }, 'tweet-shots API started');
});

// ─── Graceful shutdown ──────────────────────────────────────────────

function shutdown(signal) {
  logger.info({ signal }, 'Shutting down...');
  server.close(async () => {
    if (renderPool) await renderPool.shutdown();
    logger.info('Server closed');
    process.exit(0);
  });
  // Force exit after 10s if connections don't close
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection — shutting down');
  shutdown('unhandledRejection');
});

export default app;
