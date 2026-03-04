/**
 * Firebase Admin SDK initialization for server-side token verification.
 * Lazy singleton — initialized on first use with Application Default Credentials.
 * On Cloud Run (GCP project: tweet-shots-api), ADC auto-detects project.
 */

import admin from 'firebase-admin';

let _app = null;

export function getFirebaseApp() {
  if (!_app) {
    _app = admin.initializeApp();
  }
  return _app;
}

export function getFirebaseAuth() {
  return getFirebaseApp().auth();
}

/**
 * Verify a Firebase ID token and return decoded claims.
 * @param {string} idToken - Firebase ID token from the client
 * @returns {Promise<import('firebase-admin').auth.DecodedIdToken>}
 * @throws {Error} If token is invalid or expired
 */
export async function verifyIdToken(idToken) {
  return getFirebaseAuth().verifyIdToken(idToken);
}
