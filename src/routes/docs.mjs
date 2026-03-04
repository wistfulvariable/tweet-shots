/**
 * API documentation routes.
 * Serves comprehensive HTML docs, JSON API reference, and LLM-friendly plain text.
 */

import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { TIERS } from '../config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_HTML_PATH = path.resolve(__dirname, '../../docs.html');
const DOCS_JS_PATH = path.resolve(__dirname, '../../docs.js');
const LLM_DOCS_PATH = path.resolve(__dirname, '../../llm-docs.txt');

const API_BASE = 'https://tweet-shots-api-1084185199991.us-central1.run.app';

/** Structured docs data for JSON API consumers (backward-compatible). */
export function buildDocsData() {
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

export function docsRoutes() {
  const router = Router();

  router.get('/docs.js', (req, res) => {
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(DOCS_JS_PATH);
  });

  router.get('/docs/llm', (req, res) => {
    res.type('text/plain');
    res.sendFile(LLM_DOCS_PATH);
  });

  router.get('/docs', (req, res) => {
    const accept = req.headers.accept || '';
    if (accept.includes('text/html')) {
      return res.sendFile(DOCS_HTML_PATH);
    }
    res.json(buildDocsData());
  });

  return router;
}
