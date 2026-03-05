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
    const PUBLIC_TIERS = ['free', 'pro', 'business'];
    const pricing = PUBLIC_TIERS.map(name => ({
      tier: name,
      price: TIERS[name].price,
      rateLimit: `${TIERS[name].rateLimit} requests/min`,
      monthlyCredits: TIERS[name].monthlyCredits,
    }));
    res.json({ tiers: pricing });
  });

  return router;
}
