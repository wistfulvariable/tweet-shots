# Data Storage

## Overview

All storage is flat JSON files on disk. No database, no Redis. Files are loaded into memory at startup and written back periodically or on mutation.

## api-keys.json

```json
{
  "ts_free_<id>": {
    "name": "Display name",
    "tier": "free|pro|business",
    "email": "optional",
    "created": "ISO timestamp",
    "active": true
  }
}
```
- Loaded into `apiKeys` map at server startup
- Written via `saveJSON()` on every key create/revoke
- **Currently committed to git** — see security.md

## usage.json (api-server.mjs)

```json
{
  "ts_free_<id>": {
    "total": 42,
    "monthly": { "2026-03": 5 },
    "lastUsed": "ISO timestamp"
  }
}
```
- Loaded into `usage` map at startup
- Saved every 10 requests (can lose up to 9 on crash)
- Monthly key format: `"YYYY-MM"` (zero-padded month)

## customers.json (stripe-billing.mjs)

```json
{
  "user@example.com": {
    "stripeCustomerId": "cus_xxx",
    "email": "user@example.com",
    "name": "User Name",
    "apiKey": "ts_free_...",
    "tier": "free|pro|business",
    "usageThisMonth": 12,
    "usageResetDate": "ISO timestamp (start of next month)",
    "created": "ISO timestamp"
  }
}
```
- Created/updated by `stripe-billing.mjs` functions
- Usage reset check: `if (now >= new Date(customer.usageResetDate))`
- Saved every 10 usage increments

## subscriptions.json (stripe-billing.mjs)

```json
{
  "sub_xxx": {
    "customerId": "cus_xxx",
    "email": "user@example.com",
    "tier": "pro",
    "status": "active|cancelled",
    "currentPeriodEnd": "ISO timestamp",
    "updated": "ISO timestamp"
  }
}
```

## loadJSON / saveJSON Pattern

Both `api-server.mjs` and `stripe-billing.mjs` define their own `loadJSON`/`saveJSON` helpers with identical implementations — duplicated code.

```js
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
```

## API Key Format Reference

| Created by | Format | Uniqueness |
|---|---|---|
| Admin API (`api-server.mjs`) | `ts_<tier>_<uuidv4 no dashes>` | Random UUID |
| Free signup (`api-server.mjs`) | `ts_free_<uuid slice 0-24>` | Random UUID |
| stripe-billing free | `ts_free_<base64(email) slice 0-24>` | Email-derived |
| stripe-billing paid | `ts_<tier>_<base64(email) slice 0-20>` | Email-derived |
| Test key (hardcoded) | `ts_free_test123` | Hardcoded |
