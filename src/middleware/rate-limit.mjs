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
      message: { error: 'Rate limit exceeded. Please wait 60 seconds before retrying. Check the Retry-After header for details.', code: 'RATE_LIMITED' },
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
    message: { error: 'Too many signup attempts. Please try again in 15 minutes.', code: 'RATE_LIMITED' },
  });
}

/**
 * IP-based rate limiter for billing endpoints (checkout, portal).
 * 10 requests per 15 minutes per IP.
 */
export function billingLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many billing requests. Please try again in 15 minutes.', code: 'RATE_LIMITED' },
  });
}

/**
 * IP-based rate limiter for the public demo endpoint.
 * 5 requests per minute per IP.
 */
export function demoLimiter() {
  return rateLimit({
    windowMs: 60_000,
    max: 5,
    message: { error: 'Demo rate limit reached (5 requests/min). Sign up for an API key at /billing/signup for higher limits.', code: 'DEMO_RATE_LIMITED' },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

/**
 * IP-based rate limiter for dashboard API endpoints.
 * 30 requests per minute per IP.
 */
export function dashboardLimiter() {
  return rateLimit({
    windowMs: 60_000,
    max: 30,
    message: { error: 'Too many dashboard requests. Please wait a moment and try again.', code: 'RATE_LIMITED' },
    standardHeaders: true,
    legacyHeaders: false,
  });
}
