/**
 * Unit tests for Stripe service (src/services/stripe.mjs).
 * Tests customer management, checkout/portal sessions, subscription
 * lifecycle handlers, and webhook event routing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFirestoreMock } from '../helpers/firestore-mock.mjs';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mock = createFirestoreMock();

vi.mock('../../src/services/firestore.mjs', () => ({
  apiKeysCollection: mock.apiKeysCollection,
  usageCollection: mock.usageCollection,
  customersCollection: mock.customersCollection,
  subscriptionsCollection: mock.subscriptionsCollection,
  FieldValue: mock.FieldValue,
  getDb: mock.getDb,
}));

vi.mock('../../src/services/api-keys.mjs', () => ({
  createApiKey: vi.fn(async ({ tier, name, email }) => ({
    keyString: `ts_${tier}_mock123456789012345678`,
    tier,
    name: name || 'Unnamed',
  })),
  updateApiKeyTier: vi.fn(async () => {}),
}));

const {
  createStripeClient,
  getOrCreateCustomer,
  createCheckoutSession,
  createPortalSession,
  handleSubscriptionUpdate,
  handleSubscriptionCancelled,
  handleWebhook,
} = await import('../../src/services/stripe.mjs');
const { createApiKey, updateApiKeyTier } = await import('../../src/services/api-keys.mjs');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mockLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

function createMockStripe() {
  return {
    customers: {
      list: vi.fn(async () => ({ data: [] })),
      create: vi.fn(async ({ email, name }) => ({
        id: `cus_mock_${email.split('@')[0]}`,
        email,
        name,
      })),
    },
    checkout: {
      sessions: {
        create: vi.fn(async (params) => ({
          id: 'sess_mock_123',
          url: 'https://checkout.stripe.com/sess_mock_123',
          ...params,
        })),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async (params) => ({
          url: 'https://billing.stripe.com/portal_123',
          ...params,
        })),
      },
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  };
}

const TEST_CONFIG = {
  STRIPE_SECRET_KEY: 'sk_test_mock',
  STRIPE_PRICE_PRO: 'price_pro_123',
  STRIPE_PRICE_BUSINESS: 'price_biz_456',
  STRIPE_WEBHOOK_SECRET: 'whsec_mock',
};

beforeEach(() => {
  mock.collections.apiKeys._store.clear();
  mock.collections.usage._store.clear();
  mock.collections.customers._store.clear();
  mock.collections.subscriptions._store.clear();
  vi.clearAllMocks();

  // Restore default createApiKey mock
  createApiKey.mockImplementation(async ({ tier, name, email }) => ({
    keyString: `ts_${tier}_mock123456789012345678`,
    tier,
    name: name || 'Unnamed',
  }));
  updateApiKeyTier.mockImplementation(async () => {});
});

// ─── createStripeClient ──────────────────────────────────────────────────────

describe('createStripeClient', () => {
  it('returns null when STRIPE_SECRET_KEY is not set', () => {
    const client = createStripeClient({});
    expect(client).toBeNull();
  });

  it('returns null when STRIPE_SECRET_KEY is undefined', () => {
    const client = createStripeClient({ STRIPE_SECRET_KEY: undefined });
    expect(client).toBeNull();
  });

  it('returns a Stripe instance when STRIPE_SECRET_KEY is set', () => {
    const client = createStripeClient({ STRIPE_SECRET_KEY: 'sk_test_abc' });
    expect(client).not.toBeNull();
    expect(client).toBeDefined();
  });
});

// ─── getOrCreateCustomer ─────────────────────────────────────────────────────

describe('getOrCreateCustomer', () => {
  it('returns existing customer from Firestore without calling Stripe', async () => {
    const existingCustomer = {
      email: 'existing@example.com',
      stripeCustomerId: 'cus_existing',
      apiKeyId: 'ts_free_existing123',
      tier: 'pro',
      name: 'Existing User',
    };
    mock.collections.customers._store.set('existing@example.com', existingCustomer);

    const stripe = createMockStripe();
    const result = await getOrCreateCustomer(stripe, 'existing@example.com');

    expect(result).toEqual(existingCustomer);
    expect(stripe.customers.list).not.toHaveBeenCalled();
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it('creates new customer in Stripe when not in Firestore or Stripe', async () => {
    const stripe = createMockStripe();
    const result = await getOrCreateCustomer(stripe, 'new@example.com', 'New User');

    expect(stripe.customers.list).toHaveBeenCalledWith({ email: 'new@example.com', limit: 1 });
    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: 'new@example.com',
      name: 'New User',
      metadata: { source: 'tweet-shots-api' },
    });
    expect(createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'free', name: 'New User', email: 'new@example.com' })
    );
    expect(result.email).toBe('new@example.com');
    expect(result.apiKeyId).toMatch(/^ts_free_/);
  });

  it('uses existing Stripe customer when found in Stripe but not Firestore', async () => {
    const stripe = createMockStripe();
    stripe.customers.list.mockResolvedValue({
      data: [{ id: 'cus_stripe_existing', email: 'found@example.com' }],
    });

    const result = await getOrCreateCustomer(stripe, 'found@example.com');

    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(result.stripeCustomerId).toBe('cus_stripe_existing');
    expect(createApiKey).toHaveBeenCalled();
  });

  it('uses email as name fallback when name is not provided', async () => {
    const stripe = createMockStripe();
    await getOrCreateCustomer(stripe, 'noname@example.com');

    expect(createApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'noname@example.com' })
    );
  });

  it('stores customer data in Firestore', async () => {
    const stripe = createMockStripe();
    await getOrCreateCustomer(stripe, 'stored@example.com', 'Stored User');

    const stored = mock.collections.customers._store.get('stored@example.com');
    expect(stored).toBeDefined();
    expect(stored.email).toBe('stored@example.com');
    expect(stored.tier).toBe('free');
  });
});

// ─── createCheckoutSession ───────────────────────────────────────────────────

describe('createCheckoutSession', () => {
  it('creates checkout session with correct pro price', async () => {
    const stripe = createMockStripe();
    // Pre-populate customer to avoid double-creation
    mock.collections.customers._store.set('checkout@example.com', {
      email: 'checkout@example.com',
      stripeCustomerId: 'cus_checkout',
      apiKeyId: 'ts_free_checkout123',
      tier: 'free',
    });

    const session = await createCheckoutSession(
      stripe, TEST_CONFIG, 'checkout@example.com', 'pro',
      'https://example.com/success', 'https://example.com/cancel'
    );

    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_checkout',
        mode: 'subscription',
        line_items: [{ price: 'price_pro_123', quantity: 1 }],
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
        metadata: { tier: 'pro', email: 'checkout@example.com' },
      })
    );
    expect(session.url).toBeDefined();
  });

  it('creates checkout session with business price', async () => {
    const stripe = createMockStripe();
    mock.collections.customers._store.set('biz@example.com', {
      email: 'biz@example.com',
      stripeCustomerId: 'cus_biz',
      apiKeyId: 'ts_free_biz123',
      tier: 'free',
    });

    await createCheckoutSession(
      stripe, TEST_CONFIG, 'biz@example.com', 'business',
      'https://example.com/success', 'https://example.com/cancel'
    );

    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_biz_456', quantity: 1 }],
      })
    );
  });

  it('throws when price ID is not configured for tier', async () => {
    const stripe = createMockStripe();
    mock.collections.customers._store.set('no-price@example.com', {
      email: 'no-price@example.com',
      stripeCustomerId: 'cus_noprice',
      apiKeyId: 'ts_free_noprice123',
      tier: 'free',
    });

    const configNoPrice = { ...TEST_CONFIG, STRIPE_PRICE_PRO: undefined };
    await expect(
      createCheckoutSession(stripe, configNoPrice, 'no-price@example.com', 'pro', '', '')
    ).rejects.toThrow('No Stripe Price ID configured for tier: pro');
  });
});

// ─── createPortalSession ─────────────────────────────────────────────────────

describe('createPortalSession', () => {
  it('creates portal session for existing customer', async () => {
    mock.collections.customers._store.set('portal@example.com', {
      email: 'portal@example.com',
      stripeCustomerId: 'cus_portal',
    });

    const stripe = createMockStripe();
    const session = await createPortalSession(stripe, 'portal@example.com', 'https://example.com');

    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_portal',
      return_url: 'https://example.com',
    });
    expect(session.url).toBeDefined();
  });

  it('throws when customer not found', async () => {
    const stripe = createMockStripe();
    await expect(
      createPortalSession(stripe, 'unknown@example.com', 'https://example.com')
    ).rejects.toThrow('Customer not found');
  });
});

// ─── handleSubscriptionUpdate ────────────────────────────────────────────────

describe('handleSubscriptionUpdate', () => {
  it('updates customer tier to pro when subscription active with pro price', async () => {
    mock.collections.customers._store.set('update@example.com', {
      email: 'update@example.com',
      stripeCustomerId: 'cus_update',
      apiKeyId: 'ts_free_update123',
      tier: 'free',
    });

    const subscription = {
      id: 'sub_123',
      customer: 'cus_update',
      status: 'active',
      current_period_end: 1700000000 + 86400,
      items: { data: [{ price: { id: 'price_pro_123' } }] },
    };

    await handleSubscriptionUpdate(TEST_CONFIG, subscription, mockLogger);

    const customer = mock.collections.customers._store.get('update@example.com');
    expect(customer.tier).toBe('pro');
    expect(updateApiKeyTier).toHaveBeenCalledWith('ts_free_update123', 'pro');
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'pro', status: 'active' }),
      'Subscription updated'
    );
  });

  it('updates to business tier for business price', async () => {
    mock.collections.customers._store.set('biz@example.com', {
      email: 'biz@example.com',
      stripeCustomerId: 'cus_biz',
      apiKeyId: 'ts_free_biz123',
      tier: 'free',
    });

    const subscription = {
      id: 'sub_biz',
      customer: 'cus_biz',
      status: 'active',
      current_period_end: 1700000000 + 86400,
      items: { data: [{ price: { id: 'price_biz_456' } }] },
    };

    await handleSubscriptionUpdate(TEST_CONFIG, subscription, mockLogger);

    expect(updateApiKeyTier).toHaveBeenCalledWith('ts_free_biz123', 'business');
  });

  it('downgrades to free when subscription is not active', async () => {
    mock.collections.customers._store.set('inactive@example.com', {
      email: 'inactive@example.com',
      stripeCustomerId: 'cus_inactive',
      apiKeyId: 'ts_pro_inactive123',
      tier: 'pro',
    });

    const subscription = {
      id: 'sub_inactive',
      customer: 'cus_inactive',
      status: 'past_due',
      current_period_end: 1700000000,
      items: { data: [{ price: { id: 'price_pro_123' } }] },
    };

    await handleSubscriptionUpdate(TEST_CONFIG, subscription, mockLogger);

    expect(updateApiKeyTier).toHaveBeenCalledWith('ts_pro_inactive123', 'free');
  });

  it('defaults to free tier when price ID matches no configured price', async () => {
    mock.collections.customers._store.set('unknown-price@example.com', {
      email: 'unknown-price@example.com',
      stripeCustomerId: 'cus_unknown',
      apiKeyId: 'ts_free_unknown123',
      tier: 'free',
    });

    const subscription = {
      id: 'sub_unknown',
      customer: 'cus_unknown',
      status: 'active',
      current_period_end: 1700000000 + 86400,
      items: { data: [{ price: { id: 'price_unknown_999' } }] },
    };

    await handleSubscriptionUpdate(TEST_CONFIG, subscription, mockLogger);

    expect(updateApiKeyTier).toHaveBeenCalledWith('ts_free_unknown123', 'free');
  });

  it('logs warning when customer not found for subscription', async () => {
    const subscription = {
      id: 'sub_orphan',
      customer: 'cus_nonexistent',
      status: 'active',
      items: { data: [{ price: { id: 'price_pro_123' } }] },
    };

    await handleSubscriptionUpdate(TEST_CONFIG, subscription, mockLogger);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: 'cus_nonexistent' }),
      'Customer not found for subscription'
    );
    expect(updateApiKeyTier).not.toHaveBeenCalled();
  });

  it('stores subscription record in Firestore', async () => {
    mock.collections.customers._store.set('sub-store@example.com', {
      email: 'sub-store@example.com',
      stripeCustomerId: 'cus_substore',
      apiKeyId: 'ts_free_substore123',
      tier: 'free',
    });

    const subscription = {
      id: 'sub_store_123',
      customer: 'cus_substore',
      status: 'active',
      current_period_end: 1700000000 + 86400,
      items: { data: [{ price: { id: 'price_pro_123' } }] },
    };

    await handleSubscriptionUpdate(TEST_CONFIG, subscription, mockLogger);

    const storedSub = mock.collections.subscriptions._store.get('sub_store_123');
    expect(storedSub).toBeDefined();
    expect(storedSub.email).toBe('sub-store@example.com');
    expect(storedSub.tier).toBe('pro');
    expect(storedSub.status).toBe('active');
  });

  it('skips API key update when customer has no apiKeyId', async () => {
    mock.collections.customers._store.set('nokey@example.com', {
      email: 'nokey@example.com',
      stripeCustomerId: 'cus_nokey',
      tier: 'free',
      // No apiKeyId
    });

    const subscription = {
      id: 'sub_nokey',
      customer: 'cus_nokey',
      status: 'active',
      current_period_end: 1700000000 + 86400,
      items: { data: [{ price: { id: 'price_pro_123' } }] },
    };

    await handleSubscriptionUpdate(TEST_CONFIG, subscription, mockLogger);

    expect(updateApiKeyTier).not.toHaveBeenCalled();
  });

  it('handles missing subscription items gracefully', async () => {
    mock.collections.customers._store.set('noitems@example.com', {
      email: 'noitems@example.com',
      stripeCustomerId: 'cus_noitems',
      apiKeyId: 'ts_free_noitems123',
      tier: 'free',
    });

    const subscription = {
      id: 'sub_noitems',
      customer: 'cus_noitems',
      status: 'active',
      current_period_end: 1700000000 + 86400,
      // No items field
    };

    await handleSubscriptionUpdate(TEST_CONFIG, subscription, mockLogger);

    // Should default to free tier since no price match
    expect(updateApiKeyTier).toHaveBeenCalledWith('ts_free_noitems123', 'free');
  });
});

// ─── handleSubscriptionCancelled ─────────────────────────────────────────────

describe('handleSubscriptionCancelled', () => {
  it('downgrades customer to free tier', async () => {
    mock.collections.customers._store.set('cancel@example.com', {
      email: 'cancel@example.com',
      stripeCustomerId: 'cus_cancel',
      apiKeyId: 'ts_pro_cancel123',
      tier: 'pro',
    });
    mock.collections.subscriptions._store.set('sub_cancel', {
      email: 'cancel@example.com',
      tier: 'pro',
      status: 'active',
    });

    const subscription = {
      id: 'sub_cancel',
      customer: 'cus_cancel',
    };

    await handleSubscriptionCancelled(TEST_CONFIG, subscription, mockLogger);

    const customer = mock.collections.customers._store.get('cancel@example.com');
    expect(customer.tier).toBe('free');
    expect(updateApiKeyTier).toHaveBeenCalledWith('ts_pro_cancel123', 'free');
  });

  it('updates subscription record status to cancelled', async () => {
    mock.collections.customers._store.set('cancel-sub@example.com', {
      email: 'cancel-sub@example.com',
      stripeCustomerId: 'cus_cancel_sub',
      apiKeyId: 'ts_pro_cancel_sub',
      tier: 'pro',
    });
    mock.collections.subscriptions._store.set('sub_cancel_sub', {
      email: 'cancel-sub@example.com',
      tier: 'pro',
      status: 'active',
    });

    await handleSubscriptionCancelled(TEST_CONFIG, { id: 'sub_cancel_sub', customer: 'cus_cancel_sub' }, mockLogger);

    const sub = mock.collections.subscriptions._store.get('sub_cancel_sub');
    expect(sub.status).toBe('cancelled');
    expect(sub.tier).toBe('free');
  });

  it('logs warning when customer not found for cancellation', async () => {
    await handleSubscriptionCancelled(
      TEST_CONFIG,
      { id: 'sub_orphan', customer: 'cus_nonexistent' },
      mockLogger
    );

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: 'cus_nonexistent' }),
      'Customer not found for cancellation'
    );
    expect(updateApiKeyTier).not.toHaveBeenCalled();
  });

  it('skips API key update when customer has no apiKeyId', async () => {
    mock.collections.customers._store.set('nokey-cancel@example.com', {
      email: 'nokey-cancel@example.com',
      stripeCustomerId: 'cus_nokey_cancel',
      tier: 'pro',
      // No apiKeyId
    });
    mock.collections.subscriptions._store.set('sub_nokey_cancel', {
      email: 'nokey-cancel@example.com',
      tier: 'pro',
      status: 'active',
    });

    await handleSubscriptionCancelled(
      TEST_CONFIG,
      { id: 'sub_nokey_cancel', customer: 'cus_nokey_cancel' },
      mockLogger
    );

    expect(updateApiKeyTier).not.toHaveBeenCalled();
  });

  it('logs cancellation info', async () => {
    mock.collections.customers._store.set('log-cancel@example.com', {
      email: 'log-cancel@example.com',
      stripeCustomerId: 'cus_log_cancel',
      apiKeyId: 'ts_pro_log_cancel',
      tier: 'pro',
    });
    mock.collections.subscriptions._store.set('sub_log', {
      email: 'log-cancel@example.com',
      tier: 'pro',
      status: 'active',
    });

    await handleSubscriptionCancelled(
      TEST_CONFIG,
      { id: 'sub_log', customer: 'cus_log_cancel' },
      mockLogger
    );

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'log-cancel@example.com' }),
      'Subscription cancelled, downgraded to free'
    );
  });
});

// ─── handleWebhook ───────────────────────────────────────────────────────────

describe('handleWebhook', () => {
  it('routes subscription.created to handleSubscriptionUpdate', async () => {
    mock.collections.customers._store.set('webhook@example.com', {
      email: 'webhook@example.com',
      stripeCustomerId: 'cus_webhook',
      apiKeyId: 'ts_free_webhook',
      tier: 'free',
    });

    const event = {
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_webhook',
          customer: 'cus_webhook',
          status: 'active',
          current_period_end: 1700000000 + 86400,
          items: { data: [{ price: { id: 'price_pro_123' } }] },
        },
      },
    };

    await handleWebhook(TEST_CONFIG, event, mockLogger);

    expect(updateApiKeyTier).toHaveBeenCalledWith('ts_free_webhook', 'pro');
  });

  it('routes subscription.updated to handleSubscriptionUpdate', async () => {
    mock.collections.customers._store.set('wh-update@example.com', {
      email: 'wh-update@example.com',
      stripeCustomerId: 'cus_wh_update',
      apiKeyId: 'ts_pro_wh_update',
      tier: 'pro',
    });

    const event = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_wh_update',
          customer: 'cus_wh_update',
          status: 'active',
          current_period_end: 1700000000 + 86400,
          items: { data: [{ price: { id: 'price_biz_456' } }] },
        },
      },
    };

    await handleWebhook(TEST_CONFIG, event, mockLogger);

    expect(updateApiKeyTier).toHaveBeenCalledWith('ts_pro_wh_update', 'business');
  });

  it('routes subscription.deleted to handleSubscriptionCancelled', async () => {
    mock.collections.customers._store.set('wh-cancel@example.com', {
      email: 'wh-cancel@example.com',
      stripeCustomerId: 'cus_wh_cancel',
      apiKeyId: 'ts_pro_wh_cancel',
      tier: 'pro',
    });
    mock.collections.subscriptions._store.set('sub_wh_cancel', {
      email: 'wh-cancel@example.com',
      tier: 'pro',
      status: 'active',
    });

    const event = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_wh_cancel',
          customer: 'cus_wh_cancel',
        },
      },
    };

    await handleWebhook(TEST_CONFIG, event, mockLogger);

    expect(updateApiKeyTier).toHaveBeenCalledWith('ts_pro_wh_cancel', 'free');
  });

  it('logs checkout.session.completed', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: { object: { customer_email: 'checkout@example.com' } },
    };

    await handleWebhook(TEST_CONFIG, event, mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'checkout@example.com' }),
      'Checkout completed'
    );
  });

  it('logs invoice.payment_succeeded', async () => {
    const event = {
      type: 'invoice.payment_succeeded',
      data: { object: { customer_email: 'paid@example.com' } },
    };

    await handleWebhook(TEST_CONFIG, event, mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'paid@example.com' }),
      'Payment succeeded'
    );
  });

  it('logs warning for invoice.payment_failed', async () => {
    const event = {
      type: 'invoice.payment_failed',
      data: { object: { customer_email: 'failed@example.com' } },
    };

    await handleWebhook(TEST_CONFIG, event, mockLogger);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'failed@example.com' }),
      'Payment failed'
    );
  });

  it('logs debug for unhandled event types', async () => {
    const event = {
      type: 'customer.updated',
      data: { object: {} },
    };

    await handleWebhook(TEST_CONFIG, event, mockLogger);

    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'customer.updated' }),
      'Unhandled webhook event'
    );
  });

  it('logs the webhook event type on receipt', async () => {
    const event = {
      type: 'invoice.payment_succeeded',
      data: { object: { customer_email: 'test@example.com' } },
    };

    await handleWebhook(TEST_CONFIG, event, mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'invoice.payment_succeeded' }),
      'Stripe webhook received'
    );
  });
});
