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

/** Format current UTC date as 'YYYY-MM' for monthly usage bucketing. */
function getCurrentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Get the UTC midnight ISO string for the 1st of next month. */
function getResetDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/**
 * Track usage AND enforce monthly credit limit in one call.
 * Uses Firestore FieldValue.increment() for safe concurrent writes.
 *
 * @param {string} keyString - The API key
 * @param {string} tier - The key's current tier
 * @returns {{ allowed: boolean, remaining: number, limit: number, tier: string, error?: string }}
 */
export async function trackAndEnforce(keyString, tier) {
  const currentMonth = getCurrentMonth();
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
      error: `Monthly credit limit of ${limit} screenshots reached for the ${tier} tier. Upgrade at /billing/checkout for more credits, or wait until next month.`,
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
 * Check if N credits are available and reserve them atomically.
 * Used by batch endpoint to consume multiple credits in one call.
 *
 * @param {string} keyString - The API key
 * @param {string} tier - The key's current tier
 * @param {number} count - Number of credits to consume
 * @returns {{ allowed: boolean, remaining: number, limit: number, tier: string, error?: string }}
 */
export async function checkAndReserveCredits(keyString, tier, count) {
  const currentMonth = getCurrentMonth();
  const limit = TIERS[tier]?.monthlyCredits ?? TIERS.free.monthlyCredits;

  const usageRef = usageCollection().doc(keyString);
  const doc = await usageRef.get();

  // First usage ever for this key
  if (!doc.exists) {
    if (count > limit) {
      return {
        allowed: false, remaining: limit, limit, tier,
        error: `Batch of ${count} screenshots exceeds the monthly credit limit of ${limit} for the ${tier} tier. Reduce the batch size or upgrade at /billing/checkout.`,
      };
    }
    await usageRef.set({
      total: count,
      currentMonth,
      currentMonthCount: count,
      lastUsed: FieldValue.serverTimestamp(),
    });
    return { allowed: true, remaining: limit - count, limit, tier };
  }

  const data = doc.data();

  // Month rolled over — reset the monthly counter
  if (data.currentMonth !== currentMonth) {
    if (count > limit) {
      return {
        allowed: false, remaining: limit, limit, tier,
        error: `Batch of ${count} screenshots exceeds the monthly credit limit of ${limit} for the ${tier} tier. Reduce the batch size or upgrade at /billing/checkout.`,
      };
    }
    await usageRef.update({
      total: FieldValue.increment(count),
      currentMonth,
      currentMonthCount: count,
      lastUsed: FieldValue.serverTimestamp(),
    });
    return { allowed: true, remaining: limit - count, limit, tier };
  }

  // Check if enough credits remain
  const used = data.currentMonthCount;
  if (used + count > limit) {
    const remaining = Math.max(0, limit - used);
    return {
      allowed: false, remaining, limit, tier,
      error: `Batch of ${count} screenshots would exceed the monthly credit limit. ${remaining} credits remaining for the ${tier} tier. Reduce the batch size or upgrade at /billing/checkout.`,
    };
  }

  // Reserve N credits atomically
  await usageRef.update({
    total: FieldValue.increment(count),
    currentMonthCount: FieldValue.increment(count),
    lastUsed: FieldValue.serverTimestamp(),
  });

  return { allowed: true, remaining: limit - (used + count), limit, tier };
}

/**
 * Get current usage stats for a key (read-only, no mutation).
 * Used by GET /billing/usage endpoint.
 */
export async function getUsageStats(keyString, tier) {
  const doc = await usageCollection().doc(keyString).get();
  const limit = TIERS[tier]?.monthlyCredits ?? TIERS.free.monthlyCredits;
  const currentMonth = getCurrentMonth();
  const resetDate = getResetDate();

  if (!doc.exists) {
    return { tier, used: 0, limit, remaining: limit, currentMonth, resetDate };
  }

  const data = doc.data();

  // If stored month differs from current month, usage is effectively 0
  const used = data.currentMonth === currentMonth ? data.currentMonthCount : 0;

  return {
    tier,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    currentMonth,
    resetDate,
  };
}
