/**
 * API key CRUD operations backed by Firestore.
 *
 * Unified key format: ts_<tier>_<random-uuid-no-dashes>
 * Replaces both the admin UUID keys and the Stripe base64-of-email keys
 * from the old codebase with a single random format.
 */

import { randomUUID } from 'node:crypto';
import { apiKeysCollection, FieldValue } from './firestore.mjs';
import { VALID_TIERS } from '../config.mjs';

/**
 * Generate a new API key string.
 * @param {string} tier - free | pro | business
 * @returns {string} e.g. "ts_pro_a1b2c3d4e5f6..."
 */
export function generateKeyString(tier) {
  if (!VALID_TIERS.includes(tier)) {
    throw new Error(`Invalid tier: ${tier}. Must be one of: ${VALID_TIERS.join(', ')}`);
  }
  return `ts_${tier}_${randomUUID().replace(/-/g, '')}`;
}

/**
 * Create and store a new API key in Firestore.
 * @param {object} opts
 * @param {string} [opts.tier='free']
 * @param {string} [opts.name]
 * @param {string} [opts.email]
 * @param {object} [opts.batch] - Firestore WriteBatch. When provided, the write
 *   is added to the batch instead of committed immediately (caller must commit).
 * @returns {{ keyString: string, tier: string, name: string }}
 */
export async function createApiKey({ tier = 'free', name, email = null, batch = null }) {
  const keyString = generateKeyString(tier);
  const data = {
    tier,
    name: name || 'Unnamed',
    email,
    active: true,
    created: FieldValue.serverTimestamp(),
  };

  const docRef = apiKeysCollection().doc(keyString);
  if (batch) {
    batch.set(docRef, data);
  } else {
    await docRef.set(data);
  }

  return { keyString, tier, name: name || 'Unnamed' };
}

/**
 * Validate an API key and return its data.
 * @returns {object|null} Key data if valid and active, null otherwise.
 */
export async function validateApiKey(keyString) {
  const doc = await apiKeysCollection().doc(keyString).get();
  if (!doc.exists) return null;

  const data = doc.data();
  if (!data.active) return null;

  return { keyString, ...data };
}

/**
 * Revoke an API key (soft-delete — sets active to false).
 * @returns {boolean} true if key existed and was revoked.
 */
export async function revokeApiKey(keyString) {
  const doc = await apiKeysCollection().doc(keyString).get();
  if (!doc.exists) return false;

  await apiKeysCollection().doc(keyString).update({ active: false });
  return true;
}

/**
 * List all API keys (admin view).
 * Returns full key ID internally (_id) and masked key for display.
 */
export async function listApiKeys() {
  const snapshot = await apiKeysCollection().get();
  return snapshot.docs.map(doc => ({
    _id: doc.id,
    key: doc.id.slice(0, 12) + '...',
    ...doc.data(),
  }));
}

/**
 * Find an existing active API key by email address.
 * @param {string} email
 * @returns {Promise<{ keyString: string, tier: string, name: string } | null>}
 */
export async function findKeyByEmail(email) {
  if (!email) return null;

  const snapshot = await apiKeysCollection()
    .where('email', '==', email)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();

  if (!data.active) return null;

  return { keyString: doc.id, tier: data.tier, name: data.name };
}

/**
 * Update a key's tier without changing the key string.
 * Used by Stripe subscription changes — customers keep one key forever.
 */
export async function updateApiKeyTier(keyString, newTier) {
  if (!VALID_TIERS.includes(newTier)) {
    throw new Error(`Invalid tier: ${newTier}`);
  }
  await apiKeysCollection().doc(keyString).update({ tier: newTier });
}
