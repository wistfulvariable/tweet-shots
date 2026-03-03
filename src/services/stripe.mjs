/**
 * Stripe customer and subscription management.
 *
 * Key design changes from old stripe-billing.mjs:
 * - Firestore replaces JSON files for customer/subscription storage
 * - On tier change, the API key string stays the same — only the tier field updates
 * - No key-swap behavior — customers keep one key forever
 * - Single unified key format (ts_<tier>_<uuid>) via api-keys service
 */

import Stripe from 'stripe';
import { customersCollection, subscriptionsCollection, FieldValue, getDb } from './firestore.mjs';
import { createApiKey, updateApiKeyTier } from './api-keys.mjs';

/**
 * Create a lazily-initialized Stripe client.
 * Returns null if STRIPE_SECRET_KEY is not set (billing disabled).
 */
export function createStripeClient(config) {
  if (!config.STRIPE_SECRET_KEY) return null;
  return new Stripe(config.STRIPE_SECRET_KEY);
}

/**
 * Find or create a Stripe customer, with a free API key in Firestore.
 * @returns {{ email, stripeCustomerId, apiKeyId, tier, name }}
 */
export async function getOrCreateCustomer(stripe, email, name = null) {
  const custRef = customersCollection().doc(email);
  const doc = await custRef.get();

  if (doc.exists) return doc.data();

  // Check if customer exists in Stripe already
  const existing = await stripe.customers.list({ email, limit: 1 });

  let stripeCustomer;
  if (existing.data.length > 0) {
    stripeCustomer = existing.data[0];
  } else {
    stripeCustomer = await stripe.customers.create({
      email,
      name,
      metadata: { source: 'tweet-shots-api' },
    });
  }

  // Atomic batch: create API key + customer record together
  const batch = getDb().batch();
  const { keyString } = await createApiKey({ tier: 'free', name: name || email, email, batch });

  const customerData = {
    email,
    name,
    stripeCustomerId: stripeCustomer.id,
    apiKeyId: keyString,
    tier: 'free',
    created: FieldValue.serverTimestamp(),
  };

  batch.set(custRef, customerData);
  await batch.commit();
  return { ...customerData, created: new Date().toISOString() };
}

/**
 * Create a Stripe Checkout session for a paid subscription.
 */
export async function createCheckoutSession(stripe, config, email, tier, successUrl, cancelUrl) {
  const customer = await getOrCreateCustomer(stripe, email);

  const priceId = tier === 'pro' ? config.STRIPE_PRICE_PRO : config.STRIPE_PRICE_BUSINESS;
  if (!priceId) {
    throw new Error(`No Stripe Price ID configured for tier: ${tier}`);
  }

  return stripe.checkout.sessions.create({
    customer: customer.stripeCustomerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { tier, email },
  });
}

/**
 * Create a Stripe Customer Portal session.
 */
export async function createPortalSession(stripe, email, returnUrl) {
  const doc = await customersCollection().doc(email).get();
  if (!doc.exists) throw new Error('Customer not found');

  return stripe.billingPortal.sessions.create({
    customer: doc.data().stripeCustomerId,
    return_url: returnUrl,
  });
}

/**
 * Handle subscription created/updated webhook.
 * Updates the tier on the existing API key — no key swap.
 */
export async function handleSubscriptionUpdate(config, subscription, logger) {
  const customerId = subscription.customer;

  // Find customer by stripeCustomerId
  const snapshot = await customersCollection()
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    logger.warn({ stripeCustomerId: customerId }, 'Customer not found for subscription');
    return;
  }

  const custDoc = snapshot.docs[0];
  const customer = custDoc.data();

  // Determine tier from price ID
  let tier = 'free';
  const priceId = subscription.items?.data?.[0]?.price?.id;
  if (priceId === config.STRIPE_PRICE_PRO) tier = 'pro';
  if (priceId === config.STRIPE_PRICE_BUSINESS) tier = 'business';

  const activeTier = subscription.status === 'active' ? tier : 'free';

  // Update the customer's tier
  await custDoc.ref.update({ tier: activeTier, updated: FieldValue.serverTimestamp() });

  // Update the existing API key's tier — key string stays the same
  if (customer.apiKeyId) {
    await updateApiKeyTier(customer.apiKeyId, activeTier);
  }

  // Track subscription in Firestore
  await subscriptionsCollection().doc(subscription.id).set({
    email: customer.email,
    tier: activeTier,
    status: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
    updated: FieldValue.serverTimestamp(),
  });

  logger.info({ email: customer.email, tier: activeTier, status: subscription.status }, 'Subscription updated');
}

/**
 * Handle subscription cancelled webhook.
 * Downgrades to free tier — key string stays the same.
 */
export async function handleSubscriptionCancelled(config, subscription, logger) {
  const customerId = subscription.customer;

  const snapshot = await customersCollection()
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();

  if (snapshot.empty) {
    logger.warn({ stripeCustomerId: customerId }, 'Customer not found for cancellation');
    return;
  }

  const custDoc = snapshot.docs[0];
  const customer = custDoc.data();

  // Downgrade to free
  await custDoc.ref.update({ tier: 'free', updated: FieldValue.serverTimestamp() });

  if (customer.apiKeyId) {
    await updateApiKeyTier(customer.apiKeyId, 'free');
  }

  // Update subscription record
  await subscriptionsCollection().doc(subscription.id).update({
    status: 'cancelled',
    tier: 'free',
    updated: FieldValue.serverTimestamp(),
  });

  logger.info({ email: customer.email }, 'Subscription cancelled, downgraded to free');
}

/**
 * Route Stripe webhook events to the appropriate handler.
 */
export async function handleWebhook(config, event, logger) {
  logger.info({ type: event.type }, 'Stripe webhook received');

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionUpdate(config, event.data.object, logger);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionCancelled(config, event.data.object, logger);
      break;

    case 'checkout.session.completed':
      logger.info({ email: event.data.object.customer_email }, 'Checkout completed');
      break;

    case 'invoice.payment_succeeded':
      logger.info({ email: event.data.object.customer_email }, 'Payment succeeded');
      break;

    case 'invoice.payment_failed':
      logger.warn({ email: event.data.object.customer_email }, 'Payment failed');
      break;

    default:
      logger.debug({ type: event.type }, 'Unhandled webhook event');
  }
}
