/**
 * Billing routes — signup, checkout, portal, usage, webhooks.
 * Replaces addBillingRoutes() from old stripe-billing.mjs.
 */

import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIGNUP_JS_PATH = path.resolve(__dirname, '../../signup.js');

const PAGE_STYLE = `
:root { --bg: #0f172a; --card: #1e293b; --text: #f1f5f9; --text-secondary: #94a3b8; --accent: #3b82f6; --accent-hover: #2563eb; --border: rgba(255,255,255,0.08); }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
.card { background: var(--card); border-radius: 12px; padding: 40px; max-width: 480px; width: 100%; margin: 20px; text-align: center; }
h1 { font-size: 1.6rem; margin-bottom: 12px; }
p { color: var(--text-secondary); margin-bottom: 20px; }
a.link { color: var(--accent); text-decoration: none; display: block; margin: 8px 0; }
a.link:hover { text-decoration: underline; }
.btn { display: inline-block; padding: 12px 28px; border-radius: 8px; font-weight: 600; text-decoration: none; border: none; font-size: 1rem; cursor: pointer; transition: background 0.2s; }
.btn-primary { background: var(--accent); color: white; }
.btn-primary:hover { background: var(--accent-hover); }
input { width: 100%; padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 1rem; margin-bottom: 12px; }
input:focus { border-color: var(--accent); }
label { display: block; text-align: left; color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 4px; }
.key-box { background: var(--bg); border: 1px solid var(--accent); border-radius: 8px; padding: 16px; margin: 16px 0; word-break: break-all; font-family: monospace; font-size: 0.95rem; position: relative; cursor: pointer; }
.key-box:hover { border-color: var(--accent-hover); }
.error { color: #ef4444; margin: 12px 0; }
.hidden { display: none; }
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
`;

function renderSignupPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign Up - tweet-shots API</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<div class="card">
  <h1>Get your API key</h1>
  <p>Sign up for a free account with 50 screenshots/month.</p>
  <form id="signup-form">
    <label for="email">Email (required)</label>
    <input type="email" id="email" name="email" required placeholder="you@example.com" autocomplete="email">
    <label for="name">Name (optional)</label>
    <input type="text" id="name" name="name" placeholder="Your name" autocomplete="name">
    <button type="submit" class="btn btn-primary" style="width:100%" id="submit-btn">Get API Key</button>
  </form>
  <div id="error-msg" class="error hidden"></div>
  <div id="success-area" class="hidden">
    <p style="color:var(--text);margin-bottom:8px">Your API key:</p>
    <div class="key-box" id="key-box" title="Click to copy"></div>
    <p style="font-size:0.85rem" id="copy-msg">Click the key to copy it. Save it somewhere safe!</p>
    <a href="/docs" class="link">Read the API docs</a>
    <a href="/#pricing" class="link">Upgrade to Pro or Business</a>
  </div>
  <a href="/" class="link" style="margin-top:16px">Back to home</a>
</div>
<script src="/signup.js"></script>
</body>
</html>`;
}

function renderBillingPage({ title, heading, message, links }) {
  const linkHtml = links.map(l => `<a href="${l.href}" class="link">${l.label}</a>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} - tweet-shots</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
<div class="card">
  <h1>${heading}</h1>
  <p>${message}</p>
  ${linkHtml}
</div>
</body>
</html>`;
}

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

  // ─── GET /billing/signup — signup form page ─────────────────────────
  router.get('/billing/signup', (req, res) => {
    res.type('html').send(renderSignupPage());
  });

  // ─── GET /signup.js — serve external signup script ─────────────────
  router.get('/signup.js', (req, res) => {
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(SIGNUP_JS_PATH);
  });

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
        logger.error({ err, email: req.validated?.email }, 'Signup failed');
        res.status(500).json({ error: 'Unable to complete signup at this time. Please try again later.', code: 'SIGNUP_FAILED' });
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
          error: 'Billing is not available at this time.',
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
        logger.error({ err, email: req.validated?.email, tier: req.validated?.tier }, 'Checkout session creation failed');
        res.status(500).json({ error: 'Unable to start checkout. Please verify your email and try again.', code: 'CHECKOUT_FAILED' });
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
          error: 'Billing is not available at this time.',
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
        logger.error({ err, email: req.validated?.email }, 'Portal session creation failed');
        res.status(500).json({ error: 'Unable to open billing portal. Please verify your email and try again.', code: 'PORTAL_FAILED' });
      }
    }
  );

  // ─── GET /billing/usage — authenticated, returns credit stats ─────
  router.get('/billing/usage', authenticate, async (req, res) => {
    try {
      const stats = await getUsageStats(req.apiKey, req.keyData.tier);
      res.json(stats);
    } catch (err) {
      logger.error({ err, apiKey: req.apiKey?.slice(0, 12) + '...' }, 'Usage stats fetch failed');
      res.status(500).json({ error: 'Unable to retrieve usage data at this time. Please try again later.', code: 'USAGE_STATS_FAILED' });
    }
  });

  // ─── POST /webhook/stripe — Stripe webhook handler ────────────────
  router.post('/webhook/stripe', async (req, res) => {
    if (!stripe || !config.STRIPE_WEBHOOK_SECRET) {
      return res.status(400).json({ error: 'Webhook endpoint not configured', code: 'WEBHOOK_NOT_CONFIGURED' });
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
      logger.error({ err, eventType: req.body?.type }, 'Webhook processing failed');
      res.status(400).json({ error: 'Webhook signature verification failed', code: 'WEBHOOK_FAILED' });
    }
  });

  // ─── Success/cancel pages ─────────────────────────────────────────
  router.get('/billing/success', (req, res) => {
    res.type('html').send(renderBillingPage({
      title: 'Payment Successful!',
      heading: 'Your subscription is active',
      message: 'Your existing API key has been automatically upgraded to your new tier. If you are a new user, check your email for your API key.',
      links: [
        { href: '/billing/usage', label: 'Check your credits' },
        { href: '/docs', label: 'API documentation' },
        { href: '/', label: 'Back to home' },
      ],
    }));
  });

  router.get('/billing/cancel', (req, res) => {
    res.type('html').send(renderBillingPage({
      title: 'Payment Cancelled',
      heading: 'Payment cancelled',
      message: 'No worries! You can try again anytime.',
      links: [
        { href: '/#pricing', label: 'View pricing' },
        { href: '/', label: 'Back to home' },
      ],
    }));
  });

  return router;
}
