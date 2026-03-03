/**
 * Per-tier rate limiting middleware.
 * Uses express-rate-limit with per-API-key bucketing.
 */

import rateLimit from 'express-rate-limit';
import { TIERS } from '../config.mjs';

// Pre-create limiters for all tiers at module load time
// (avoids ERR_ERL_CREATED_IN_REQUEST_HANDLER warning)
const limiters = Object.fromEntries(
  Object.entries(TIERS).map(([tier, config]) => [
    tier,
    rateLimit({
      windowMs: 60_000,
      max: config.rateLimit,
      message: { error: 'Rate limit exceeded', code: 'RATE_LIMITED' },
      keyGenerator: (req) => req.apiKey,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  ])
);

/**
 * Apply per-tier rate limit based on req.keyData.tier.
 * Must run after authenticate middleware.
 */
export function applyRateLimit(req, res, next) {
  const tier = req.keyData?.tier || 'free';
  const limiter = limiters[tier] || limiters.free;
  limiter(req, res, next);
}

/**
 * IP-based rate limiter for signup endpoints.
 * 5 requests per 15 minutes per IP.
 */
export function signupLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many signups from this IP, try again later', code: 'RATE_LIMITED' },
  });
}
