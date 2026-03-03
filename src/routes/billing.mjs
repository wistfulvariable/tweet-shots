/**
 * Billing routes — signup, checkout, portal, usage, webhooks.
 * Replaces addBillingRoutes() from old stripe-billing.mjs.
 */

import { Router } from 'express';
import {
  createStripeClient,
  getOrCreateCustomer,
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
} from '../services/stripe.mjs';
import { createApiKey, findKeyByEmail } from '../services/api-keys.mjs';
import { getUsageStats } from '../services/usage.mjs';
import { signupSchema, checkoutSchema, portalSchema } from '../schemas/request-schemas.mjs';
import { validate } from '../middleware/validate.mjs';
import { signupLimiter, billingLimiter } from '../middleware/rate-limit.mjs';

/**
 * @param {object} deps
 * @param {Function} deps.authenticate - Auth middleware
 * @param {object} deps.config - App config
 * @param {object} deps.logger
 */
export function billingRoutes({ authenticate, config, logger }) {
  const router = Router();
  const stripe = createStripeClient(config);
  const billingRateLimit = billingLimiter();

  // ─── POST /billing/signup — free tier, no Stripe needed ───────────
  router.post(
    '/billing/signup',
    signupLimiter(),
    validate(signupSchema, 'body'),
    async (req, res) => {
      try {
        const { email, name } = req.validated;

        // If Stripe is configured, create full customer record
        if (stripe) {
          const customer = await getOrCreateCustomer(stripe, email, name);
          logger.info({ email, tier: 'free' }, 'Signup via Stripe customer');
          return res.json({
            success: true,
            apiKey: customer.apiKeyId,
            tier: 'free',
            credits: 50,
            message: 'Your API key is ready! Save it somewhere safe.',
          });
        }

        // No Stripe — check for existing key first (idempotent signup)
        const existing = await findKeyByEmail(email);
        if (existing) {
          return res.json({
            success: true,
            apiKey: existing.keyString,
            tier: existing.tier,
            credits: 50,
            message: 'Your API key is ready! Save it somewhere safe.',
          });
        }

        const { keyString } = await createApiKey({ tier: 'free', name: name || email, email });
        logger.info({ email, tier: 'free' }, 'Self-service signup: new key created');
        res.json({
          success: true,
          apiKey: keyString,
          tier: 'free',
          credits: 50,
          message: 'Your API key is ready! Save it somewhere safe.',
        });
      } catch (err) {
        logger.error({ err }, 'Signup failed');
        res.status(500).json({ error: 'Signup failed', code: 'SIGNUP_FAILED' });
      }
    }
  );

  // ─── POST /billing/checkout — create Stripe checkout session ──────
  router.post(
    '/billing/checkout',
    billingRateLimit,
    validate(checkoutSchema, 'body'),
    async (req, res) => {
      if (!stripe) {
        return res.status(503).json({
          error: 'Stripe billing is not configured',
          code: 'BILLING_NOT_CONFIGURED',
        });
      }

      try {
        const { email, tier, successUrl, cancelUrl } = req.validated;
        const session = await createCheckoutSession(
          stripe,
          config,
          email,
          tier,
          successUrl || `${req.protocol}://${req.get('host')}/billing/success`,
          cancelUrl || `${req.protocol}://${req.get('host')}/billing/cancel`,
        );
        res.json({ url: session.url, sessionId: session.id });
      } catch (err) {
        logger.error({ err }, 'Checkout session creation failed');
        res.status(400).json({ error: 'Checkout session creation failed', code: 'CHECKOUT_FAILED' });
      }
    }
  );

  // ─── POST /billing/portal — Stripe customer portal ────────────────
  router.post(
    '/billing/portal',
    billingRateLimit,
    validate(portalSchema, 'body'),
    async (req, res) => {
      if (!stripe) {
        return res.status(503).json({
          error: 'Stripe billing is not configured',
          code: 'BILLING_NOT_CONFIGURED',
        });
      }

      try {
        const { email, returnUrl } = req.validated;
        const session = await createPortalSession(
          stripe,
          email,
          returnUrl || `${req.protocol}://${req.get('host')}/`,
        );
        res.json({ url: session.url });
      } catch (err) {
        logger.error({ err }, 'Portal session creation failed');
        res.status(400).json({ error: 'Portal session creation failed', code: 'PORTAL_FAILED' });
      }
    }
  );

  // ─── GET /billing/usage — authenticated, returns credit stats ─────
  router.get('/billing/usage', authenticate, async (req, res) => {
    try {
      const stats = await getUsageStats(req.apiKey, req.keyData.tier);
      res.json(stats);
    } catch (err) {
      logger.error({ err }, 'Usage stats fetch failed');
      res.status(500).json({ error: 'Failed to get usage stats', code: 'USAGE_STATS_FAILED' });
    }
  });

  // ─── POST /webhook/stripe — Stripe webhook handler ────────────────
  router.post('/webhook/stripe', async (req, res) => {
    if (!stripe || !config.STRIPE_WEBHOOK_SECRET) {
      return res.status(400).json({ error: 'Webhook not configured', code: 'WEBHOOK_NOT_CONFIGURED' });
    }

    const sig = req.headers['stripe-signature'];
    if (!sig) {
      return res.status(400).json({ error: 'Missing stripe-signature header', code: 'MISSING_SIGNATURE' });
    }

    try {
      const event = stripe.webhooks.constructEvent(req.rawBody, sig, config.STRIPE_WEBHOOK_SECRET);
      await handleWebhook(config, event, logger);
      res.json({ received: true });
    } catch (err) {
      logger.error({ err }, 'Webhook processing failed');
      res.status(400).json({ error: 'Webhook processing failed', code: 'WEBHOOK_FAILED' });
    }
  });

  // ─── Success/cancel pages ─────────────────────────────────────────
  router.get('/billing/success', (req, res) => {
    res.send(`<!DOCTYPE html>
<html><head><title>Success!</title></head>
<body style="font-family:system-ui;text-align:center;padding:50px">
<h1>Payment Successful!</h1>
<p>Your subscription is now active. Check your email for your API key.</p>
<a href="/">Back to API</a>
</body></html>`);
  });

  router.get('/billing/cancel', (req, res) => {
    res.send(`<!DOCTYPE html>
<html><head><title>Cancelled</title></head>
<body style="font-family:system-ui;text-align:center;padding:50px">
<h1>Payment Cancelled</h1>
<p>No worries! You can try again anytime.</p>
<a href="/">Back to API</a>
</body></html>`);
  });

  return router;
}
