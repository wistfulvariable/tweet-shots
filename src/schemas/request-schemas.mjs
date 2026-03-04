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
const LOGO_POSITION_VALUES = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const FRAME_VALUES = ['phone'];

// Boolean string transform for query params ("true"/"false" → boolean)
const boolString = z.enum(['true', 'false']).transform(v => v === 'true').default('false');

/**
 * GET /screenshot/:tweetIdOrUrl query parameters.
 */
export const screenshotQuerySchema = z.object({
  theme: z.enum(THEME_VALUES).default('dark'),
  dimension: z.enum(DIMENSION_VALUES).default('auto'),
  format: z.enum(['png', 'svg']).default('png'),
  scale: z.coerce.number().int().min(1).max(3).default(2),
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
  showUrl: boolString,
  padding: z.coerce.number().int().min(0).max(100).default(20),
  radius: z.coerce.number().int().min(0).max(100).default(16),
  fontFamily: z.string().max(100).optional(),
  fontUrl: z.string().url().optional(),
  fontBoldUrl: z.string().url().optional(),
  // Watermark/logo (not exposed on demo endpoint — SSRF risk)
  logo: z.string().url().optional(),
  logoPosition: z.enum(LOGO_POSITION_VALUES).optional(),
  logoSize: z.coerce.number().int().min(16).max(200).optional(),
  // Phone mockup frame
  frame: z.enum(FRAME_VALUES).optional(),
  // Custom gradient colors
  gradientFrom: hexColor,
  gradientTo: hexColor,
  gradientAngle: z.coerce.number().int().min(0).max(360).optional(),
  // Thread rendering
  thread: boolString,
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
  scale: z.number().int().min(1).max(3).default(2),
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
  showUrl: z.boolean().default(false),
  padding: z.number().int().min(0).max(100).default(20),
  radius: z.number().int().min(0).max(100).optional(),
  borderRadius: z.number().int().min(0).max(100).optional(),
  fontFamily: z.string().max(100).optional(),
  fontUrl: z.string().url().optional(),
  fontBoldUrl: z.string().url().optional(),
  // Watermark/logo
  logo: z.string().url().optional(),
  logoPosition: z.enum(LOGO_POSITION_VALUES).optional(),
  logoSize: z.number().int().min(16).max(200).optional(),
  // Phone mockup frame
  frame: z.enum(FRAME_VALUES).optional(),
  // Custom gradient colors
  gradientFrom: hexColor,
  gradientTo: hexColor,
  gradientAngle: z.number().int().min(0).max(360).optional(),
  // Thread rendering
  thread: z.boolean().default(false),
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

// ─── Shared render options for batch schemas ────────────────────────────────

const batchRenderOptions = {
  theme: z.enum(THEME_VALUES).default('dark'),
  dimension: z.enum(DIMENSION_VALUES).default('auto'),
  format: z.enum(['png', 'svg']).default('png'),
  scale: z.number().int().min(1).max(3).default(2),
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
  showUrl: z.boolean().default(false),
  padding: z.number().int().min(0).max(100).default(20),
  radius: z.number().int().min(0).max(100).optional(),
  borderRadius: z.number().int().min(0).max(100).optional(),
  fontFamily: z.string().max(100).optional(),
  fontUrl: z.string().url().optional(),
  fontBoldUrl: z.string().url().optional(),
  // Watermark/logo
  logo: z.string().url().optional(),
  logoPosition: z.enum(LOGO_POSITION_VALUES).optional(),
  logoSize: z.number().int().min(16).max(200).optional(),
  // Phone mockup frame
  frame: z.enum(FRAME_VALUES).optional(),
  // Custom gradient colors
  gradientFrom: hexColor,
  gradientTo: hexColor,
  gradientAngle: z.number().int().min(0).max(360).optional(),
  // Thread rendering
  thread: z.boolean().default(false),
};

/**
 * POST /screenshot/batch JSON body.
 * urls array + shared render options + response format.
 * Max URL count enforced in handler (depends on tier).
 */
export const batchScreenshotSchema = z.object({
  urls: z.array(z.string().min(1)).min(1, 'At least one URL or tweet ID is required'),
  response: z.enum(['base64', 'url']).default('base64'),
  ...batchRenderOptions,
});

/**
 * Render options for multipart/form-data batch (form fields only, no urls).
 * URLs come from the CSV file.
 */
export const batchMultipartOptionsSchema = z.object({
  response: z.enum(['base64', 'url']).default('base64'),
  ...batchRenderOptions,
});

/**
 * GET /demo/screenshot/:tweetIdOrUrl query parameters.
 * Matches screenshotQuerySchema minus logo/fontUrl/fontBoldUrl (SSRF risk on public endpoint).
 */
export const demoQuerySchema = z.object({
  theme: z.enum(THEME_VALUES).default('dark'),
  dimension: z.enum(DIMENSION_VALUES).default('auto'),
  format: z.enum(['png', 'svg']).default('png'),
  scale: z.coerce.number().int().min(1).max(3).default(2),
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
  showUrl: boolString,
  padding: z.coerce.number().int().min(0).max(100).default(20),
  radius: z.coerce.number().int().min(0).max(100).default(16),
  // Phone mockup frame
  frame: z.enum(FRAME_VALUES).optional(),
  // Custom gradient colors
  gradientFrom: hexColor,
  gradientTo: hexColor,
  gradientAngle: z.coerce.number().int().min(0).max(360).optional(),
  // Thread rendering
  thread: boolString,
});
