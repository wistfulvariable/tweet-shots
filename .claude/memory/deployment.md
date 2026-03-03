# Deployment

## systemd (Linux — Production)

Service file: `tweet-shots-api.service`

```bash
# Deploy
sudo cp -r . /opt/tweet-shots
sudo cp tweet-shots-api.service /etc/systemd/system/

# Edit env vars (set ADMIN_KEY at minimum)
sudo nano /etc/systemd/system/tweet-shots-api.service

# Start
sudo systemctl daemon-reload
sudo systemctl enable tweet-shots-api
sudo systemctl start tweet-shots-api

# Logs
journalctl -u tweet-shots-api -f
```

Service runs as `www-data` with:
- `NoNewPrivileges=true`
- `PrivateTmp=true`
- `ProtectSystem=strict`
- `ProtectHome=true`
- `ReadWritePaths=/opt/tweet-shots`

**Required:** Set `ADMIN_KEY` in the service file before first start. The placeholder is `your-secure-admin-key-here`.

## Docker

No Dockerfile in repo. Documented example in API.md:
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "api-server.mjs"]
```

Pass env vars via `docker run -e ADMIN_KEY=... -e STRIPE_SECRET_KEY=...`

## Environment Setup Checklist

```
ADMIN_KEY                  Required — rotate from default
STRIPE_SECRET_KEY          Required for billing
STRIPE_PRICE_PRO           Required for Pro subscription checkout
STRIPE_PRICE_BUSINESS      Required for Business subscription checkout
STRIPE_WEBHOOK_SECRET      Required for secure webhook processing
OPENAI_API_KEY             Optional — enables CLI translation feature
PUBLIC_URL                 Optional — enables "url" response type in API
OUTPUT_DIR                 Optional — defaults to ./output
PORT                       Optional — defaults to 3000
```

## Data File Permissions

If running as `www-data`, ensure `/opt/tweet-shots` is writable:
```bash
sudo chown -R www-data:www-data /opt/tweet-shots
```

Files written at runtime:
- `api-keys.json` — created on first signup if missing
- `usage.json` — created on first tracked request
- `customers.json` — created on first Stripe customer
- `subscriptions.json` — created on first subscription
- `output/` directory — created on first URL-response request

## Health Check

```bash
curl http://localhost:3000/health
# → {"status":"ok","timestamp":"..."}
```

Suitable for load balancer health checks.

## Test Key

On first startup with empty `api-keys.json`:
```
Test API key created: ts_free_test123
```
**Remove or disable this key in production** — it's hardcoded and publicly documented.

## Stripe Webhook

Register endpoint in Stripe Dashboard:
```
POST https://your-domain.com/webhook/stripe
```
Events to enable:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

**Note:** `addBillingRoutes(app)` in `stripe-billing.mjs` must be called from `api-server.mjs` for the webhook endpoint to exist.
