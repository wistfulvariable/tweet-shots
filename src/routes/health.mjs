/**
 * Health, docs, and pricing routes.
 * No authentication required — public endpoints.
 */

import { Router } from 'express';
import { TIERS } from '../config.mjs';

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
    res.json({
      authentication: {
        description: 'Include API key in X-API-KEY header or apiKey query param',
        example: 'curl -H "X-API-KEY: your-key" https://api.tweetshots.dev/screenshot/123',
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
            hideMetrics: 'true|false',
            hideMedia: 'true|false',
            hideDate: 'true|false',
            hideVerified: 'true|false',
            hideShadow: 'true|false',
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
    });
  });

  return router;
}
