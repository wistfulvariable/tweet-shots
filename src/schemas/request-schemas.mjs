/**
 * Zod schemas for all API request validation.
 * Replaces the absent input validation in the old api-server.mjs.
 */

import { z } from 'zod';
import { VALID_TIERS } from '../config.mjs';

// Reusable hex color validator
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex color like #ff0000').optional();

// Valid theme/dimension/gradient values (matches core.mjs exports)
const THEME_VALUES = ['light', 'dark', 'dim', 'black'];
const DIMENSION_VALUES = [
  'auto', 'instagramFeed', 'instagramStory', 'instagramVertical',
  'tiktok', 'linkedin', 'twitter', 'facebook', 'youtube',
];
const GRADIENT_VALUES = [
  'sunset', 'ocean', 'forest', 'fire', 'midnight', 'sky', 'candy', 'peach',
];

// Boolean string transform for query params ("true"/"false" → boolean)
const boolString = z.enum(['true', 'false']).transform(v => v === 'true').default('false');

/**
 * GET /screenshot/:tweetIdOrUrl query parameters.
 */
export const screenshotQuerySchema = z.object({
  theme: z.enum(THEME_VALUES).default('dark'),
  dimension: z.enum(DIMENSION_VALUES).default('auto'),
  format: z.enum(['png', 'svg']).default('png'),
  scale: z.coerce.number().int().min(1).max(3).default(1),
  gradient: z.enum(GRADIENT_VALUES).optional(),
  bgColor: hexColor,
  textColor: hexColor,
  linkColor: hexColor,
  hideMetrics: boolString,
  hideMedia: boolString,
  hideDate: boolString,
  hideVerified: boolString,
  hideShadow: boolString,
  hideQuoteTweet: boolString,
  padding: z.coerce.number().int().min(0).max(100).default(20),
  radius: z.coerce.number().int().min(0).max(100).default(16),
});

/**
 * POST /screenshot JSON body.
 */
export const screenshotBodySchema = z.object({
  tweetId: z.string().optional(),
  tweetUrl: z.string().optional(),
  response: z.enum(['image', 'base64', 'url']).default('image'),
  theme: z.enum(THEME_VALUES).default('dark'),
  dimension: z.enum(DIMENSION_VALUES).default('auto'),
  format: z.enum(['png', 'svg']).default('png'),
  scale: z.number().int().min(1).max(3).default(1),
  gradient: z.enum(GRADIENT_VALUES).optional(),
  backgroundGradient: z.enum(GRADIENT_VALUES).optional(),
  bgColor: hexColor,
  backgroundColor: hexColor,
  textColor: hexColor,
  linkColor: hexColor,
  showMetrics: z.boolean().optional(),
  hideMetrics: z.boolean().default(false),
  hideMedia: z.boolean().default(false),
  hideDate: z.boolean().default(false),
  hideVerified: z.boolean().default(false),
  hideQuoteTweet: z.boolean().default(false),
  hideShadow: z.boolean().default(false),
  padding: z.number().int().min(0).max(100).default(20),
  radius: z.number().int().min(0).max(100).optional(),
  borderRadius: z.number().int().min(0).max(100).optional(),
}).refine(data => data.tweetId || data.tweetUrl, {
  message: 'Either tweetId or tweetUrl is required',
});

/**
 * POST /admin/keys body.
 */
export const createKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  tier: z.enum(VALID_TIERS).default('free'),
});

/**
 * POST /billing/signup body.
 */
export const signupSchema = z.object({
  email: z.string().email('Valid email required'),
  name: z.string().min(1).max(100).optional(),
});

/**
 * POST /billing/checkout body.
 */
export const checkoutSchema = z.object({
  email: z.string().email('Valid email required'),
  tier: z.enum(['pro', 'business']),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

/**
 * POST /billing/portal body.
 */
export const portalSchema = z.object({
  email: z.string().email('Valid email required'),
  returnUrl: z.string().url().optional(),
});
