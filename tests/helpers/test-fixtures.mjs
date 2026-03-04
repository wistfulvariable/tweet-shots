/**
 * Shared test fixtures for unit and integration tests.
 */

/** Returns YYYY-MM for the current UTC month. Use this instead of hardcoded months. */
export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const TEST_CONFIG = {
  PORT: 3001,
  HOST: '127.0.0.1',
  NODE_ENV: 'test',
  ADMIN_KEY: 'test-admin-key-long-enough',
  STRIPE_SECRET_KEY: undefined,
  STRIPE_PRICE_PRO: undefined,
  STRIPE_PRICE_BUSINESS: undefined,
  STRIPE_WEBHOOK_SECRET: undefined,
  GCS_BUCKET: 'test-bucket',
  OPENAI_API_KEY: undefined,
};

export const MOCK_TWEET = {
  id_str: '1234567890',
  text: 'Hello, this is a test tweet! #testing',
  user: {
    name: 'Test User',
    screen_name: 'testuser',
    profile_image_url_https: 'https://pbs.twimg.com/profile_images/test/photo.jpg',
    is_blue_verified: true,
  },
  created_at: '2024-01-15T12:00:00.000Z',
  favorite_count: 42,
  conversation_count: 7,
  entities: {
    hashtags: [{ text: 'testing' }],
    urls: [],
    user_mentions: [],
  },
  mediaDetails: [],
  photos: [],
};

export const MOCK_KEY_DATA = {
  tier: 'free',
  name: 'Test Key',
  email: 'test@example.com',
  active: true,
  created: '2024-01-01T00:00:00.000Z',
};

export const MOCK_API_KEY = 'ts_free_abcdef1234567890abcdef12';

export const MOCK_PRO_KEY_DATA = {
  tier: 'pro',
  name: 'Pro Key',
  email: 'pro@example.com',
  active: true,
  created: '2024-01-01T00:00:00.000Z',
};

export const MOCK_PRO_API_KEY = 'ts_pro_abcdef1234567890abcdef12';

export const MOCK_BUSINESS_KEY_DATA = {
  tier: 'business',
  name: 'Business Key',
  email: 'business@example.com',
  active: true,
  created: '2024-01-01T00:00:00.000Z',
};

export const MOCK_BUSINESS_API_KEY = 'ts_business_abcdef1234567890abcdef12';

/** Firebase mock user (as attached to req.firebaseUser by middleware) */
export const MOCK_FIREBASE_USER = {
  uid: 'firebase-uid-abc123',
  email: 'test@example.com',
  name: 'Test User',
  emailVerified: true,
  picture: 'https://lh3.googleusercontent.com/photo.jpg',
};

/** Firebase decoded ID token (as returned by verifyIdToken) */
export const MOCK_FIREBASE_TOKEN = {
  uid: 'firebase-uid-abc123',
  email: 'test@example.com',
  name: 'Test User',
  email_verified: true,
  picture: 'https://lh3.googleusercontent.com/photo.jpg',
  aud: 'tweet-shots-api',
  iss: 'https://securetoken.google.com/tweet-shots-api',
};
