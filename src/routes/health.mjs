/**
 * Health and pricing routes.
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

  return router;
}
