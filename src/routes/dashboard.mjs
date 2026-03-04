/**
 * Dashboard routes — user-facing account management with Firebase Auth.
 *
 * GET  /dashboard              — Serves dashboard HTML (auth handled client-side)
 * POST /dashboard/api/link     — Link Firebase user to customer record
 * GET  /dashboard/api/data     — Get API key, usage, tier info
 * POST /dashboard/api/checkout — Create Stripe checkout for tier upgrade
 * POST /dashboard/api/portal   — Create Stripe billing portal session
 */

import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOrLinkUser, getDashboardData } from '../services/dashboard.mjs';
import { createStripeClient, createCheckoutSession, createPortalSession } from '../services/stripe.mjs';
import { sendRouteError } from '../errors.mjs';
import { dashboardLimiter } from '../middleware/rate-limit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_JS_PATH = path.resolve(__dirname, '../../dashboard.js');

/**
 * @param {object} deps
 * @param {Function} deps.firebaseAuth - Firebase auth middleware
 * @param {object} deps.config - App config
 * @param {object} deps.logger
 */
export function dashboardRoutes({ firebaseAuth, config, logger }) {
  const router = Router();
  const stripe = createStripeClient(config);
  const rateLimit = dashboardLimiter();

  // ─── GET /dashboard — serve the dashboard HTML page ────────────────
  router.get('/dashboard', (req, res) => {
    res.type('html').send(renderDashboardPage(config));
  });

  // ─── GET /dashboard.js — serve external dashboard script ──────────
  router.get('/dashboard.js', (req, res) => {
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(DASHBOARD_JS_PATH);
  });

  // ─── All API routes require Firebase auth ──────────────────────────
  router.use('/dashboard/api', rateLimit, firebaseAuth);

  // ─── POST /dashboard/api/link — link Firebase user to customer ─────
  router.post('/dashboard/api/link', async (req, res) => {
    try {
      const result = await getOrLinkUser(req.firebaseUser);
      logger.info({
        email: req.firebaseUser.email,
        uid: req.firebaseUser.uid,
        isNew: result.isNew,
      }, 'Dashboard user linked');

      res.json({
        success: true,
        isNew: result.isNew,
        tier: result.tier,
        apiKeyId: result.apiKeyId,
      });
    } catch (err) {
      sendRouteError(res, err, 'LINK_FAILED', logger);
    }
  });

  // ─── GET /dashboard/api/data — get dashboard data ──────────────────
  router.get('/dashboard/api/data', async (req, res) => {
    try {
      const data = await getDashboardData(req.firebaseUser.email);
      if (!data) {
        return res.status(404).json({
          error: 'No account found. Please sign in again to create your account.',
          code: 'CUSTOMER_NOT_FOUND',
          ...(req.id && { requestId: req.id }),
        });
      }
      res.json(data);
    } catch (err) {
      sendRouteError(res, err, 'DASHBOARD_DATA_FAILED', logger);
    }
  });

  // ─── POST /dashboard/api/checkout — Stripe checkout ────────────────
  router.post('/dashboard/api/checkout', async (req, res) => {
    if (!stripe) {
      return res.status(503).json({
        error: 'Billing is not available at this time.',
        code: 'BILLING_NOT_CONFIGURED',
        ...(req.id && { requestId: req.id }),
      });
    }

    try {
      const { tier } = req.body || {};
      if (!['pro', 'business'].includes(tier)) {
        return res.status(400).json({
          error: 'Tier must be "pro" or "business".',
          code: 'VALIDATION_ERROR',
          ...(req.id && { requestId: req.id }),
        });
      }

      const session = await createCheckoutSession(
        stripe,
        config,
        req.firebaseUser.email,
        tier,
        `${req.protocol}://${req.get('host')}/dashboard?checkout=success`,
        `${req.protocol}://${req.get('host')}/dashboard?checkout=cancel`,
      );
      res.json({ url: session.url, sessionId: session.id });
    } catch (err) {
      sendRouteError(res, err, 'DASHBOARD_CHECKOUT_FAILED', logger);
    }
  });

  // ─── POST /dashboard/api/portal — Stripe portal ───────────────────
  router.post('/dashboard/api/portal', async (req, res) => {
    if (!stripe) {
      return res.status(503).json({
        error: 'Billing is not available at this time.',
        code: 'BILLING_NOT_CONFIGURED',
        ...(req.id && { requestId: req.id }),
      });
    }

    try {
      const session = await createPortalSession(
        stripe,
        req.firebaseUser.email,
        `${req.protocol}://${req.get('host')}/dashboard`,
      );
      res.json({ url: session.url });
    } catch (err) {
      sendRouteError(res, err, 'DASHBOARD_PORTAL_FAILED', logger);
    }
  });

  return router;
}

// ─── Dashboard HTML Page ────────────────────────────────────────────

const PAGE_STYLE = `
:root { --bg: #0f172a; --card: #1e293b; --text: #f1f5f9; --text-secondary: #94a3b8; --accent: #3b82f6; --accent-hover: #2563eb; --success: #22c55e; --danger: #ef4444; --border: rgba(255,255,255,0.08); --gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; min-height: 100vh; }

.container { max-width: 720px; margin: 0 auto; padding: 40px 20px; }
.header { text-align: center; margin-bottom: 40px; }
.header h1 { font-size: 2rem; font-weight: 800; background: var(--gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 4px; }
.header p { color: var(--text-secondary); font-size: 0.95rem; }

/* Auth states */
#auth-loading { text-align: center; padding: 80px 20px; color: var(--text-secondary); }
#sign-in-area { text-align: center; padding: 60px 20px; }
#sign-in-area p { color: var(--text-secondary); margin-bottom: 24px; font-size: 1.1rem; }
#dashboard-area { display: none; }
#error-banner { display: none; background: rgba(239,68,68,0.1); border: 1px solid var(--danger); border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; color: var(--danger); font-size: 0.9rem; }

/* Google sign-in button */
.google-btn { display: inline-flex; align-items: center; gap: 12px; padding: 12px 28px; border-radius: 8px; border: 1px solid var(--border); background: white; color: #333; font-size: 1rem; font-weight: 500; cursor: pointer; transition: box-shadow 0.2s; }
.google-btn:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.3); }
.google-btn svg { width: 20px; height: 20px; }

/* Cards */
.card { background: var(--card); border-radius: 12px; padding: 24px; margin-bottom: 20px; border: 1px solid var(--border); }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.card-header h2 { font-size: 1.1rem; font-weight: 600; }
.card-label { font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }

/* Tier badge */
.tier-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; }
.tier-free { background: rgba(148,163,184,0.2); color: var(--text-secondary); }
.tier-pro { background: rgba(59,130,246,0.2); color: var(--accent); }
.tier-business { background: rgba(168,85,247,0.2); color: #a855f7; }

/* API key box */
.key-box { display: flex; align-items: center; gap: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.9rem; word-break: break-all; }
.key-box .key-text { flex: 1; }
.key-actions { display: flex; gap: 4px; flex-shrink: 0; }
.icon-btn { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; color: var(--text-secondary); cursor: pointer; font-size: 0.8rem; transition: all 0.2s; }
.icon-btn:hover { border-color: var(--accent); color: var(--accent); }

/* Usage bar */
.usage-bar-container { margin: 12px 0; }
.usage-bar { height: 8px; background: var(--bg); border-radius: 4px; overflow: hidden; }
.usage-bar-fill { height: 100%; background: var(--accent); border-radius: 4px; transition: width 0.5s ease; }
.usage-bar-fill.warning { background: #f59e0b; }
.usage-bar-fill.danger { background: var(--danger); }
.usage-stats { display: flex; justify-content: space-between; margin-top: 8px; font-size: 0.85rem; color: var(--text-secondary); }

/* Buttons */
.btn { display: inline-block; padding: 10px 24px; border-radius: 8px; font-weight: 600; text-decoration: none; border: none; font-size: 0.9rem; cursor: pointer; transition: all 0.2s; }
.btn-primary { background: var(--accent); color: white; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-outline { background: transparent; color: var(--text); border: 1px solid var(--border); }
.btn-outline:hover { border-color: var(--accent); color: var(--accent); }
.btn-sm { padding: 6px 16px; font-size: 0.85rem; }
.btn-row { display: flex; gap: 10px; flex-wrap: wrap; }

/* User header */
.user-info { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
.user-avatar { width: 40px; height: 40px; border-radius: 50%; }
.user-meta { flex: 1; }
.user-name { font-weight: 600; font-size: 0.95rem; }
.user-email { color: var(--text-secondary); font-size: 0.85rem; }

/* Not configured */
.not-configured { text-align: center; padding: 60px 20px; color: var(--text-secondary); }
.not-configured h2 { color: var(--text); margin-bottom: 12px; }

/* Focus indicators (WCAG 2.1 AA) */
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
`;

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderDashboardPage(config) {
  const firebaseApiKey = config.FIREBASE_WEB_API_KEY;
  const firebaseAuthDomain = config.FIREBASE_AUTH_DOMAIN;
  const firebaseConfigured = !!(firebaseApiKey && firebaseAuthDomain);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dashboard - tweet-shots API</title>
${firebaseConfigured ? `<meta name="firebase-api-key" content="${escapeAttr(firebaseApiKey)}">
<meta name="firebase-auth-domain" content="${escapeAttr(firebaseAuthDomain)}">` : ''}
<style>${PAGE_STYLE}</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>tweet-shots</h1>
    <p>Your API Dashboard</p>
  </div>

  ${!firebaseConfigured ? `
  <div class="not-configured">
    <h2>Dashboard Not Available</h2>
    <p>Authentication is not configured for this deployment. Contact the administrator.</p>
    <a href="/" class="btn btn-outline" style="margin-top:16px">Back to Home</a>
  </div>
  ` : `
  <div id="auth-loading">Loading...</div>

  <div id="sign-in-area" style="display:none">
    <p>Sign in with your Google account to manage your API key, view usage, and upgrade your plan.</p>
    <button id="google-sign-in-btn" class="google-btn">
      <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      Sign in with Google
    </button>
  </div>

  <div id="error-banner"></div>

  <div id="dashboard-area">
    <div class="user-info">
      <img id="user-avatar" class="user-avatar" src="" alt="" style="display:none">
      <div class="user-meta">
        <div class="user-name" id="user-name"></div>
        <div class="user-email" id="user-email"></div>
      </div>
      <button id="sign-out-btn" class="btn btn-outline btn-sm">Sign Out</button>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>API Key</h2>
        <span id="tier-badge" class="tier-badge"></span>
      </div>
      <div class="key-box">
        <span class="key-text" id="api-key-display"></span>
        <div class="key-actions">
          <button id="toggle-key-btn" class="icon-btn" title="Show/hide key">Show</button>
          <button id="copy-key-btn" class="icon-btn" title="Copy key">Copy</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Monthly Usage</h2>
        <span id="usage-period" style="font-size:0.85rem;color:var(--text-secondary)"></span>
      </div>
      <div class="usage-bar-container">
        <div class="usage-bar"><div class="usage-bar-fill" id="usage-bar-fill"></div></div>
        <div class="usage-stats">
          <span id="usage-count"></span>
          <span id="usage-remaining"></span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2>Plan</h2>
      </div>
      <div id="plan-details" style="margin-bottom:16px;font-size:0.9rem;color:var(--text-secondary)"></div>
      <div class="btn-row">
        <button id="upgrade-btn" class="btn btn-primary btn-sm" style="display:none">Upgrade Plan</button>
        <button id="manage-billing-btn" class="btn btn-outline btn-sm" style="display:none">Manage Billing</button>
      </div>
    </div>

    <div style="text-align:center;margin-top:24px">
      <a href="/docs" class="btn btn-outline btn-sm" style="margin-right:8px">API Docs</a>
      <a href="/" class="btn btn-outline btn-sm">Back to Home</a>
    </div>
  </div>
  `}
</div>

${firebaseConfigured ? `
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>
<script src="/dashboard.js"></script>
` : ''}
</body>
</html>`;
}
