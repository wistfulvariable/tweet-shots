/**
 * Shared test fixtures for unit and integration tests.
 */

export const TEST_CONFIG = {
  PORT: 3001,
  HOST: '127.0.0.1',
  NODE_ENV: 'test',
  ADMIN_KEY: 'test-admin-key-long-enough',
  STRIPE_SECRET_KEY: undefined,
  STRIPE_PRICE_PRO: undefined,
  STRIPE_PRICE_BUSINESS: undefined,
  STRIPE_WEBHOOK_SECRET: undefined,
  GCP_PROJECT_ID: undefined,
  GCS_BUCKET: 'test-bucket',
  OPENAI_API_KEY: undefined,
  PUBLIC_URL: undefined,
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
