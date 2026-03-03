/**
 * Firestore client and collection references.
 * Lazy singleton — initialized on first use with Application Default Credentials.
 */

import { Firestore, FieldValue } from '@google-cloud/firestore';

let _db = null;

export function getDb() {
  if (!_db) {
    _db = new Firestore();
  }
  return _db;
}

// Collection references
export function apiKeysCollection()       { return getDb().collection('apiKeys'); }
export function usageCollection()         { return getDb().collection('usage'); }
export function customersCollection()     { return getDb().collection('customers'); }
export function subscriptionsCollection() { return getDb().collection('subscriptions'); }

export { FieldValue };
