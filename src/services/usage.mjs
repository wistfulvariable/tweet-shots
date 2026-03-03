/**
 * Unified usage tracking and monthly credit enforcement.
 *
 * This single module replaces the disconnected dual-tracking from the old codebase:
 * - api-server.mjs had trackUsage() that counted but never enforced limits
 * - stripe-billing.mjs had trackUsage() that enforced limits but was never called
 *
 * Now there's one function (trackAndEnforce) that both counts AND enforces.
 * It's called by the billing-guard middleware on every authenticated request.
 */

import { usageCollection, FieldValue } from './firestore.mjs';
import { TIERS } from '../config.mjs';

/**
 * Track usage AND enforce monthly credit limit in one call.
 * Uses Firestore FieldValue.increment() for safe concurrent writes.
 *
 * @param {string} keyString - The API key
 * @param {string} tier - The key's current tier
 * @returns {{ allowed: boolean, remaining: number, limit: number, tier: string, error?: string }}
 */
export async function trackAndEnforce(keyString, tier) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const limit = TIERS[tier]?.monthlyCredits ?? TIERS.free.monthlyCredits;

  const usageRef = usageCollection().doc(keyString);
  const doc = await usageRef.get();

  // First usage ever for this key
  if (!doc.exists) {
    await usageRef.set({
      total: 1,
      currentMonth,
      currentMonthCount: 1,
      lastUsed: FieldValue.serverTimestamp(),
    });
    return { allowed: true, remaining: limit - 1, limit, tier };
  }

  const data = doc.data();

  // Month rolled over — reset the monthly counter
  if (data.currentMonth !== currentMonth) {
    await usageRef.update({
      total: FieldValue.increment(1),
      currentMonth,
      currentMonthCount: 1,
      lastUsed: FieldValue.serverTimestamp(),
    });
    return { allowed: true, remaining: limit - 1, limit, tier };
  }

  // At or over limit — reject before incrementing
  if (data.currentMonthCount >= limit) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      tier,
      error: 'Monthly credit limit reached. Upgrade your plan for more credits.',
    };
  }

  // Normal increment
  await usageRef.update({
    total: FieldValue.increment(1),
    currentMonthCount: FieldValue.increment(1),
    lastUsed: FieldValue.serverTimestamp(),
  });

  return {
    allowed: true,
    remaining: limit - (data.currentMonthCount + 1),
    limit,
    tier,
  };
}

/**
 * Get current usage stats for a key (read-only, no mutation).
 * Used by GET /billing/usage endpoint.
 */
export async function getUsageStats(keyString, tier) {
  const doc = await usageCollection().doc(keyString).get();
  const limit = TIERS[tier]?.monthlyCredits ?? TIERS.free.monthlyCredits;

  if (!doc.exists) {
    return { tier, used: 0, limit, remaining: limit, total: 0 };
  }

  const data = doc.data();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // If stored month differs from current month, usage is effectively 0
  const used = data.currentMonth === currentMonth ? data.currentMonthCount : 0;

  return {
    tier,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    total: data.total || 0,
    lastUsed: data.lastUsed,
  };
}
