/**
 * Centralized configuration with environment validation.
 * Single source of truth for tier definitions, env vars, and defaults.
 */

import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Auth — no more default "admin-secret-key"
  ADMIN_KEY: z.string().min(16, 'ADMIN_KEY must be at least 16 characters'),

  // Stripe (optional — billing disabled without these)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_BUSINESS: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // GCP
  GCS_BUCKET: z.string().default('tweet-shots-screenshots'),

  // Firebase (optional — dashboard disabled without these)
  FIREBASE_WEB_API_KEY: z.string().optional(),
  FIREBASE_AUTH_DOMAIN: z.string().optional(),

  // Optional features
  OPENAI_API_KEY: z.string().optional(),
});

/**
 * Load and validate configuration from environment variables.
 * Throws with descriptive errors if validation fails.
 */
export function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.issues.map(i => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${errors.join('\n')}`);
  }
  return Object.freeze(result.data);
}

/**
 * Tier definitions — single source of truth.
 * Combines rate limits (per-minute), monthly credits, and pricing.
 */
export const TIERS = Object.freeze({
  free:     { rateLimit: 10,   monthlyCredits: 50,    price: 0,  batchLimit: 10  },
  pro:      { rateLimit: 100,  monthlyCredits: 1000,  price: 9,  batchLimit: 100 },
  business: { rateLimit: 1000, monthlyCredits: 10000, price: 49, batchLimit: 500 },
});

/** Max concurrent renders within a single batch request. */
export const BATCH_CONCURRENCY = 5;

export const VALID_TIERS = Object.keys(TIERS);
