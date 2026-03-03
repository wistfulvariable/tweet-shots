/**
 * Stripe Billing Integration for tweet-shots API
 * 
 * Handles:
 * - Customer creation
 * - Subscription management
 * - Usage-based billing (metered)
 * - Webhook processing
 */

import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// CONFIGURATION
// ============================================================================

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Price IDs (set these after creating products in Stripe Dashboard)
const PRICE_IDS = {
  free: null, // No payment required
  pro: process.env.STRIPE_PRICE_PRO || 'price_pro_placeholder',
  business: process.env.STRIPE_PRICE_BUSINESS || 'price_business_placeholder',
};

// Credit limits per tier (per month)
const TIER_LIMITS = {
  free: 50,
  pro: 1000,
  business: 10000,
};

// Data files
const CUSTOMERS_FILE = path.join(__dirname, 'customers.json');
const SUBSCRIPTIONS_FILE = path.join(__dirname, 'subscriptions.json');

// ============================================================================
// DATA STORAGE (JSON - use database in production)
// ============================================================================

function loadJSON(filepath, defaultValue = {}) {
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
  } catch (e) {
    console.error(`Error loading ${filepath}:`, e.message);
  }
  return defaultValue;
}

function saveJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

// customers: { email: { stripeCustomerId, apiKey, tier, ... } }
let customers = loadJSON(CUSTOMERS_FILE, {});

// subscriptions: { stripeSubscriptionId: { customerId, tier, status, ... } }
let subscriptions = loadJSON(SUBSCRIPTIONS_FILE, {});

// ============================================================================
// CUSTOMER MANAGEMENT
// ============================================================================

/**
 * Create or retrieve a Stripe customer
 */
export async function getOrCreateCustomer(email, name = null) {
  // Check if we already have this customer
  if (customers[email]?.stripeCustomerId) {
    return customers[email];
  }
  
  // Check if customer exists in Stripe
  const existingCustomers = await stripe.customers.list({ email, limit: 1 });
  
  let stripeCustomer;
  if (existingCustomers.data.length > 0) {
    stripeCustomer = existingCustomers.data[0];
  } else {
    // Create new customer
    stripeCustomer = await stripe.customers.create({
      email,
      name,
      metadata: { source: 'tweet-shots-api' },
    });
  }
  
  // Generate API key for free tier
  const apiKey = `ts_free_${Buffer.from(email).toString('base64').replace(/[+/=]/g, '').slice(0, 24)}`;
  
  customers[email] = {
    stripeCustomerId: stripeCustomer.id,
    email,
    name,
    apiKey,
    tier: 'free',
    usageThisMonth: 0,
    usageResetDate: getNextMonthStart(),
    created: new Date().toISOString(),
  };
  
  saveJSON(CUSTOMERS_FILE, customers);
  
  return customers[email];
}

/**
 * Get customer by API key
 */
export function getCustomerByApiKey(apiKey) {
  return Object.values(customers).find(c => c.apiKey === apiKey);
}

/**
 * Get customer by email
 */
export function getCustomerByEmail(email) {
  return customers[email];
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

/**
 * Create a checkout session for subscription
 */
export async function createCheckoutSession(email, tier, successUrl, cancelUrl) {
  const customer = await getOrCreateCustomer(email);
  
  if (!PRICE_IDS[tier]) {
    throw new Error(`Invalid tier: ${tier}`);
  }
  
  const session = await stripe.checkout.sessions.create({
    customer: customer.stripeCustomerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{
      price: PRICE_IDS[tier],
      quantity: 1,
    }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      tier,
      email,
    },
  });
  
  return session;
}

/**
 * Create a customer portal session (for managing subscription)
 */
export async function createPortalSession(email, returnUrl) {
  const customer = customers[email];
  if (!customer) {
    throw new Error('Customer not found');
  }
  
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.stripeCustomerId,
    return_url: returnUrl,
  });
  
  return session;
}

/**
 * Handle subscription created/updated
 */
export function handleSubscriptionUpdate(subscription) {
  const customerId = subscription.customer;
  const email = Object.keys(customers).find(
    e => customers[e].stripeCustomerId === customerId
  );
  
  if (!email) {
    console.error('Customer not found for subscription:', subscription.id);
    return;
  }
  
  // Determine tier from price
  let tier = 'free';
  const priceId = subscription.items.data[0]?.price?.id;
  if (priceId === PRICE_IDS.pro) tier = 'pro';
  if (priceId === PRICE_IDS.business) tier = 'business';
  
  // Update customer tier
  customers[email].tier = subscription.status === 'active' ? tier : 'free';
  
  // Generate new API key for upgraded tier
  if (tier !== 'free' && subscription.status === 'active') {
    customers[email].apiKey = `ts_${tier}_${Buffer.from(email).toString('base64').replace(/[+/=]/g, '').slice(0, 20)}`;
  }
  
  saveJSON(CUSTOMERS_FILE, customers);

  // Sync new key into api-server's apiKeys map so authenticate middleware sees it
  if (_onKeySync) {
    _onKeySync(customers[email].apiKey, {
      name: customers[email].name || email,
      email,
      tier: customers[email].tier,
      created: customers[email].created,
      active: true,
    });
  }

  // Track subscription
  subscriptions[subscription.id] = {
    customerId,
    email,
    tier,
    status: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
    updated: new Date().toISOString(),
  };
  
  saveJSON(SUBSCRIPTIONS_FILE, subscriptions);
  
  console.log(`Subscription updated: ${email} -> ${tier} (${subscription.status})`);
}

/**
 * Handle subscription cancelled
 */
export function handleSubscriptionCancelled(subscription) {
  const customerId = subscription.customer;
  const email = Object.keys(customers).find(
    e => customers[e].stripeCustomerId === customerId
  );
  
  if (email) {
    const oldApiKey = customers[email].apiKey;

    // Downgrade to free tier
    customers[email].tier = 'free';
    customers[email].apiKey = `ts_free_${Buffer.from(email).toString('base64').replace(/[+/=]/g, '').slice(0, 24)}`;
    saveJSON(CUSTOMERS_FILE, customers);

    // Revoke old paid key and sync new free key
    if (_onKeyRevoke) _onKeyRevoke(oldApiKey);
    if (_onKeySync) {
      _onKeySync(customers[email].apiKey, {
        name: customers[email].name || email,
        email,
        tier: 'free',
        created: customers[email].created,
        active: true,
      });
    }

    console.log(`Subscription cancelled: ${email} -> free`);
  }
  
  if (subscriptions[subscription.id]) {
    subscriptions[subscription.id].status = 'cancelled';
    saveJSON(SUBSCRIPTIONS_FILE, subscriptions);
  }
}

// ============================================================================
// USAGE TRACKING
// ============================================================================

/**
 * Track API usage and check limits
 * Returns { allowed: boolean, remaining: number, limit: number }
 */
export function trackUsage(apiKey) {
  const customer = getCustomerByApiKey(apiKey);
  
  if (!customer) {
    return { allowed: false, remaining: 0, limit: 0, error: 'Invalid API key' };
  }
  
  const limit = TIER_LIMITS[customer.tier] || TIER_LIMITS.free;
  
  // Reset usage if new month
  const now = new Date();
  if (now >= new Date(customer.usageResetDate)) {
    customer.usageThisMonth = 0;
    customer.usageResetDate = getNextMonthStart();
    saveJSON(CUSTOMERS_FILE, customers);
  }
  
  // Check limit
  if (customer.usageThisMonth >= limit) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      error: 'Monthly limit reached. Upgrade your plan for more credits.',
    };
  }
  
  // Increment usage
  customer.usageThisMonth++;
  
  // Save periodically
  if (customer.usageThisMonth % 10 === 0) {
    saveJSON(CUSTOMERS_FILE, customers);
  }
  
  return {
    allowed: true,
    remaining: limit - customer.usageThisMonth,
    limit,
    tier: customer.tier,
  };
}

/**
 * Get usage stats for a customer
 */
export function getUsageStats(apiKey) {
  const customer = getCustomerByApiKey(apiKey);
  
  if (!customer) {
    return null;
  }
  
  const limit = TIER_LIMITS[customer.tier] || TIER_LIMITS.free;
  
  return {
    tier: customer.tier,
    used: customer.usageThisMonth,
    limit,
    remaining: Math.max(0, limit - customer.usageThisMonth),
    resetDate: customer.usageResetDate,
  };
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

/**
 * Process Stripe webhook events
 */
export function handleWebhook(event) {
  console.log(`Webhook received: ${event.type}`);
  
  switch (event.type) {
    case 'checkout.session.completed':
      // Payment successful, subscription created
      const session = event.data.object;
      console.log(`Checkout completed: ${session.customer_email}`);
      break;
      
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      handleSubscriptionUpdate(event.data.object);
      break;
      
    case 'customer.subscription.deleted':
      handleSubscriptionCancelled(event.data.object);
      break;
      
    case 'invoice.payment_succeeded':
      console.log(`Payment succeeded: ${event.data.object.customer_email}`);
      break;
      
    case 'invoice.payment_failed':
      console.log(`Payment failed: ${event.data.object.customer_email}`);
      // Could send email notification here
      break;
      
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getNextMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
}

// ============================================================================
// KEY SYNC CALLBACKS (set by addBillingRoutes, used by update/cancel handlers)
// ============================================================================

// Called when a subscription upgrade/downgrade changes a customer's API key.
// api-server passes callbacks here so its in-memory apiKeys map stays in sync.
let _onKeySync = null;
let _onKeyRevoke = null;

// ============================================================================
// EXPRESS ROUTES (to add to main server)
// ============================================================================

/**
 * @param {import('express').Application} app
 * @param {{ onKeySync?: (apiKey: string, keyData: object) => void, onKeyRevoke?: (apiKey: string) => void }} callbacks
 */
export function addBillingRoutes(app, callbacks = {}) {
  _onKeySync = callbacks.onKeySync || null;
  _onKeyRevoke = callbacks.onKeyRevoke || null;
  // Get pricing info
  app.get('/pricing', (req, res) => {
    res.json({
      plans: [
        { tier: 'free', price: 0, credits: 50, features: ['Basic themes', 'PNG output'] },
        { tier: 'pro', price: 9, credits: 1000, features: ['All themes', 'SVG output', 'Gradients', 'Priority support'] },
        { tier: 'business', price: 49, credits: 10000, features: ['Everything in Pro', 'Custom branding', 'API priority', 'Dedicated support'] },
      ],
    });
  });
  
  // Create checkout session
  app.post('/billing/checkout', async (req, res) => {
    try {
      const { email, tier, successUrl, cancelUrl } = req.body;
      
      if (!email || !tier) {
        return res.status(400).json({ error: 'Email and tier required' });
      }
      
      const session = await createCheckoutSession(
        email,
        tier,
        successUrl || `${req.protocol}://${req.get('host')}/billing/success`,
        cancelUrl || `${req.protocol}://${req.get('host')}/billing/cancel`
      );
      
      res.json({ url: session.url, sessionId: session.id });
    } catch (error) {
      console.error('Checkout error:', error);
      res.status(400).json({ error: error.message });
    }
  });
  
  // Customer portal
  app.post('/billing/portal', async (req, res) => {
    try {
      const { email, returnUrl } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }
      
      const session = await createPortalSession(
        email,
        returnUrl || `${req.protocol}://${req.get('host')}/`
      );
      
      res.json({ url: session.url });
    } catch (error) {
      console.error('Portal error:', error);
      res.status(400).json({ error: error.message });
    }
  });
  
  // Usage stats
  app.get('/billing/usage', (req, res) => {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }
    
    const stats = getUsageStats(apiKey);
    
    if (!stats) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    res.json(stats);
  });
  
  // Stripe webhook
  app.post('/webhook/stripe', (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not set — webhook endpoint is disabled');
      return res.status(400).json({ error: 'Webhook not configured', code: 'WEBHOOK_NOT_CONFIGURED' });
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
      handleWebhook(event);
      res.json({ received: true });
    } catch (error) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: error.message });
    }
  });
  
  // Success/cancel pages (simple redirects)
  app.get('/billing/success', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Success!</title></head>
      <body style="font-family: system-ui; text-align: center; padding: 50px;">
        <h1>🎉 Payment Successful!</h1>
        <p>Your subscription is now active. Check your email for your API key.</p>
        <a href="/">Back to API</a>
      </body>
      </html>
    `);
  });
  
  app.get('/billing/cancel', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Cancelled</title></head>
      <body style="font-family: system-ui; text-align: center; padding: 50px;">
        <h1>Payment Cancelled</h1>
        <p>No worries! You can try again anytime.</p>
        <a href="/">Back to API</a>
      </body>
      </html>
    `);
  });
}

export default {
  getOrCreateCustomer,
  getCustomerByApiKey,
  getCustomerByEmail,
  createCheckoutSession,
  createPortalSession,
  trackUsage,
  getUsageStats,
  handleWebhook,
  addBillingRoutes,
  TIER_LIMITS,
};
