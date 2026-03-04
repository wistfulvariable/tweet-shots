/**
 * Dashboard service — links Firebase users to customers/API keys.
 *
 * Key operations:
 * - getOrLinkUser: Find existing customer by email, link Firebase UID; or create new
 * - getDashboardData: Aggregate API key, usage, and tier data for display
 */

import { customersCollection, apiKeysCollection, FieldValue } from './firestore.mjs';
import { createApiKey, findKeyByEmail } from './api-keys.mjs';
import { getUsageStats } from './usage.mjs';
import { TIERS } from '../config.mjs';
import { AppError } from '../errors.mjs';

/**
 * Find or create a customer record linked to a Firebase UID.
 *
 * Flow:
 * 1. Check if customer doc exists for this email
 * 2. If yes and firebaseUid matches → return as-is (idempotent)
 * 3. If yes but no firebaseUid → link it (first Google sign-in for existing customer)
 * 4. If yes but DIFFERENT firebaseUid → reject (prevents account hijacking)
 * 5. If no customer → check for orphaned key by email → create free key + customer
 *
 * @param {{ uid: string, email: string, name: string }} firebaseUser
 * @returns {Promise<{ email: string, apiKeyId: string, tier: string, name: string, firebaseUid: string, isNew: boolean }>}
 */
export async function getOrLinkUser(firebaseUser) {
  const { uid, email, name } = firebaseUser;
  const custRef = customersCollection().doc(email);
  const custDoc = await custRef.get();

  if (custDoc.exists) {
    const customer = custDoc.data();

    // Already linked to this Firebase user — return as-is
    if (customer.firebaseUid === uid) {
      return { ...customer, isNew: false };
    }

    // First Google sign-in for existing customer — link UID
    if (!customer.firebaseUid) {
      await custRef.update({
        firebaseUid: uid,
        updated: FieldValue.serverTimestamp(),
      });
      return { ...customer, firebaseUid: uid, isNew: false };
    }

    // Different Firebase UID — reject to prevent account hijacking
    throw new AppError(
      'This email is already linked to a different account. Contact support if you need assistance.',
      403,
      'ACCOUNT_CONFLICT',
    );
  }

  // No customer exists — check for orphaned API key by email
  const existingKey = await findKeyByEmail(email);
  if (existingKey) {
    const customerData = {
      email,
      name,
      apiKeyId: existingKey.keyString,
      tier: existingKey.tier,
      firebaseUid: uid,
      created: FieldValue.serverTimestamp(),
    };
    await custRef.set(customerData);
    return { ...customerData, isNew: false };
  }

  // Brand new user — create free API key + customer
  const { keyString } = await createApiKey({ tier: 'free', name, email });
  const customerData = {
    email,
    name,
    apiKeyId: keyString,
    tier: 'free',
    firebaseUid: uid,
    created: FieldValue.serverTimestamp(),
  };
  await custRef.set(customerData);
  return { ...customerData, isNew: true };
}

/**
 * Get all dashboard data for a customer.
 * @param {string} email - Customer email (from Firebase token)
 * @returns {Promise<object|null>} Dashboard data or null if customer not found
 */
export async function getDashboardData(email) {
  const custDoc = await customersCollection().doc(email).get();
  if (!custDoc.exists) return null;

  const customer = custDoc.data();
  const apiKeyId = customer.apiKeyId;

  // Check API key status
  const keyDoc = await apiKeysCollection().doc(apiKeyId).get();
  const isActive = keyDoc.exists ? (keyDoc.data().active ?? false) : false;

  // Get usage stats
  const usage = await getUsageStats(apiKeyId, customer.tier);
  const tierDetails = TIERS[customer.tier] || TIERS.free;

  return {
    apiKey: apiKeyId,
    apiKeyMasked: apiKeyId.slice(0, 12) + '...',
    tier: customer.tier,
    isActive,
    usage,
    tierDetails: {
      rateLimit: tierDetails.rateLimit,
      monthlyCredits: tierDetails.monthlyCredits,
      price: tierDetails.price,
    },
    name: customer.name,
    email: customer.email,
    stripeCustomerId: customer.stripeCustomerId || null,
  };
}
