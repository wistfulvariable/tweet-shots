/**
 * Landing page route.
 * Serves landing.html for browsers, JSON API info for programmatic clients.
 */

import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LANDING_PATH = path.resolve(__dirname, '../../landing.html');

export function landingRoutes() {
  const router = Router();

  router.get('/', (req, res) => {
    const acceptsHtml = req.headers.accept?.includes('text/html');

    if (acceptsHtml && fs.existsSync(LANDING_PATH)) {
      return res.sendFile(LANDING_PATH);
    }

    res.json({
      name: 'tweet-shots API',
      version: '2.0.0',
      description: 'Generate beautiful tweet screenshots — no browser required',
      docs: '/docs',
      pricing: '/pricing',
      health: '/health',
      endpoints: {
        'GET /screenshot/:tweetIdOrUrl': 'Generate screenshot (returns image)',
        'POST /screenshot': 'Generate screenshot with options',
        'GET /tweet/:tweetIdOrUrl': 'Get tweet data as JSON',
      },
    });
  });

  return router;
}
