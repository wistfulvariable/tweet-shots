/**
 * Health, docs, and pricing routes.
 * No authentication required — public endpoints.
 */

import { Router } from 'express';
import { TIERS } from '../config.mjs';

const API_BASE = 'https://tweet-shots-api-1084185199991.us-central1.run.app';

/** Structured docs data — shared by JSON and HTML responses. */
function buildDocsData() {
  return {
    authentication: {
      description: 'Include API key in X-API-KEY header or apiKey query param',
      example: `curl -H "X-API-KEY: your-key" ${API_BASE}/screenshot/123`,
    },
    endpoints: {
      'GET /screenshot/:tweetIdOrUrl': {
        description: 'Generate screenshot and return image',
        params: { tweetIdOrUrl: 'Tweet ID or full URL (URL-encoded)' },
        query: {
          theme: 'light|dark|dim|black (default: dark)',
          dimension: 'auto|instagramFeed|instagramStory|instagramVertical|tiktok|linkedin|twitter|facebook|youtube',
          format: 'png|svg (default: png)',
          scale: '1|2|3 (default: 1)',
          gradient: 'sunset|ocean|forest|fire|midnight|sky|candy|peach',
          bgColor: 'Hex color (#rrggbb)',
          textColor: 'Hex color (#rrggbb)',
          linkColor: 'Hex color (#rrggbb)',
          hideMetrics: 'true|false (exact strings only, not 0/1/yes/no)',
          hideMedia: 'true|false (exact strings only)',
          hideDate: 'true|false (exact strings only)',
          hideVerified: 'true|false (exact strings only)',
          hideShadow: 'true|false (exact strings only)',
          hideQuoteTweet: 'true|false (exact strings only)',
          padding: '0-100 (default: 20)',
          radius: '0-100 (default: 16)',
        },
      },
      'POST /screenshot': {
        description: 'Generate screenshot with JSON body',
        body: {
          tweetId: 'Tweet ID (required if no tweetUrl)',
          tweetUrl: 'Tweet URL (required if no tweetId)',
          response: 'image|base64|url (default: image)',
          '...': 'Same options as GET query params',
        },
      },
      'GET /tweet/:tweetIdOrUrl': {
        description: 'Fetch raw tweet data as JSON',
      },
    },
    rateLimits: Object.fromEntries(
      Object.entries(TIERS).map(([tier, c]) => [tier, `${c.rateLimit} req/min`])
    ),
  };
}

/** Render the docs data as a styled HTML page. */
function renderDocsHtml(docs) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const endpointSections = Object.entries(docs.endpoints).map(([name, ep]) => {
    let paramsHtml = '';
    const allParams = { ...ep.params, ...ep.query, ...ep.body };
    if (Object.keys(allParams).length > 0) {
      const rows = Object.entries(allParams).map(([k, v]) =>
        `<tr><td><code>${esc(k)}</code></td><td>${esc(v)}</td></tr>`
      ).join('');
      paramsHtml = `<table><thead><tr><th>Parameter</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    return `<div class="endpoint"><h3><code>${esc(name)}</code></h3><p>${esc(ep.description)}</p>${paramsHtml}</div>`;
  }).join('');

  const rateLimitRows = Object.entries(docs.rateLimits).map(([tier, limit]) =>
    `<tr><td>${esc(tier)}</td><td>${esc(limit)}</td><td>${TIERS[tier]?.monthlyCredits ?? '—'} screenshots/mo</td><td>$${TIERS[tier]?.price ?? '—'}/mo</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>tweet-shots API Documentation</title>
<style>
:root { --bg: #0f172a; --card: #1e293b; --text: #f1f5f9; --text-secondary: #94a3b8; --accent: #3b82f6; --code-bg: #0d1117; --border: rgba(255,255,255,0.08); }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
.container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
h1 { font-size: 2rem; margin-bottom: 8px; }
h1 a { color: var(--accent); text-decoration: none; }
.subtitle { color: var(--text-secondary); margin-bottom: 32px; }
h2 { font-size: 1.4rem; margin: 32px 0 16px; padding-top: 24px; border-top: 1px solid var(--border); }
h3 { font-size: 1rem; margin-bottom: 8px; }
p { margin-bottom: 12px; color: var(--text-secondary); }
code { background: var(--code-bg); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
pre { background: var(--code-bg); padding: 16px; border-radius: 8px; overflow-x: auto; margin-bottom: 16px; font-size: 0.85rem; line-height: 1.5; }
pre code { background: none; padding: 0; }
table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); }
th { color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
.endpoint { background: var(--card); border-radius: 8px; padding: 20px; margin-bottom: 16px; }
.endpoint h3 { color: var(--accent); }
.endpoint p { margin-bottom: 12px; }
.endpoint table { margin-bottom: 0; }
.note { background: rgba(59,130,246,0.1); border-left: 3px solid var(--accent); padding: 12px 16px; border-radius: 0 8px 8px 0; margin-bottom: 16px; }
.note p { margin: 0; color: var(--text); }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
footer { text-align: center; padding: 24px 0; color: var(--text-secondary); font-size: 0.85rem; border-top: 1px solid var(--border); margin-top: 32px; }
</style>
</head>
<body>
<div class="container">
<h1><a href="/">tweet-shots</a> API Documentation</h1>
<p class="subtitle">Generate beautiful tweet screenshots via API. <a href="/billing/signup">Get an API key</a> to get started.</p>

<h2>Authentication</h2>
<p>${esc(docs.authentication.description)}</p>
<pre><code>${esc(docs.authentication.example)}</code></pre>

<h2>Quick Start</h2>
<pre><code># Get a free API key (50 screenshots/month)
curl -X POST ${esc(API_BASE)}/billing/signup \\
  -H "Content-Type: application/json" \\
  -d '{"email": "you@example.com"}'

# Generate a screenshot
curl "${esc(API_BASE)}/screenshot/1617979122625712128?theme=dark&amp;gradient=ocean" \\
  -H "X-API-KEY: your-api-key" \\
  -o tweet.png</code></pre>

<h2>Endpoints</h2>
${endpointSections}

<div class="note"><p>The <strong>demo endpoint</strong> <code>GET /demo/screenshot/:tweetIdOrUrl</code> is also available without authentication (5 requests/min per IP, PNG only).</p></div>

<h2>Rate Limits &amp; Pricing</h2>
<table>
<thead><tr><th>Tier</th><th>Rate Limit</th><th>Monthly Credits</th><th>Price</th></tr></thead>
<tbody>${rateLimitRows}</tbody>
</table>
<p><a href="/billing/signup">Sign up free</a> or <a href="/#pricing">view pricing details</a>.</p>

<h2>Error Responses</h2>
<p>All errors follow this format:</p>
<pre><code>{
  "error": "Human-readable message",
  "code": "SCREAMING_SNAKE_CODE",
  "requestId": "uuid-for-support"
}</code></pre>
<p>Common error codes: <code>MISSING_API_KEY</code>, <code>INVALID_API_KEY</code>, <code>RATE_LIMITED</code>, <code>MONTHLY_LIMIT_EXCEEDED</code>, <code>VALIDATION_ERROR</code>, <code>RENDER_TIMEOUT</code>, <code>SCREENSHOT_FAILED</code>.</p>

<footer><a href="/">Home</a> &middot; <a href="/pricing">Pricing API</a> &middot; <a href="/billing/signup">Sign Up</a></footer>
</div>
</body>
</html>`;
}

export function healthRoutes() {
  const router = Router();

  router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  router.get('/pricing', (req, res) => {
    const pricing = Object.entries(TIERS).map(([name, config]) => ({
      tier: name,
      price: config.price,
      rateLimit: `${config.rateLimit} requests/min`,
      monthlyCredits: config.monthlyCredits,
    }));
    res.json({ tiers: pricing });
  });

  router.get('/docs', (req, res) => {
    const docs = buildDocsData();
    const accept = req.headers.accept || '';
    if (accept.includes('text/html')) {
      return res.type('html').send(renderDocsHtml(docs));
    }
    res.json(docs);
  });

  return router;
}
