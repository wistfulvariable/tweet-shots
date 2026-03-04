# Error Messages Style Guide

## Voice & Tone

tweet-shots error messages are:
- **Specific**: Tell the user exactly what went wrong
- **Actionable**: Always include a next step (fix it, retry, or get help)
- **Blame-free**: Never say "you" or imply user fault
- **Consistent**: Same formality level across all endpoints
- **Safe**: Never expose internal details (DB errors, stack traces, third-party service names)

## Message Structure Template

```
[What happened] + [Why, if relevant] + [What to do next]
```

Examples:
- "Tweet not found or is no longer available" (what happened + implicit "check the ID")
- "Monthly credit limit of 50 screenshots reached for the free tier. Upgrade at /billing/checkout for more credits, or wait until next month." (what + why + two options)
- "Authentication service is temporarily unavailable. Please try again later." (what + action)

## Words to Avoid

| Avoid | Use Instead |
|---|---|
| "Error:" prefix | Start directly with the description |
| "You" / "Your input" | Passive voice or describe the issue |
| "Invalid" alone | Explain what's expected |
| "Failed" alone | Describe what happened and what to do |
| Internal service names (Stripe, Firestore, Satori) | Generic descriptions ("billing", "data", "rendering") |
| HTTP status codes in messages | Describe the condition instead |
| "Something went wrong" | Be specific about what failed |

## Standard Phrases

| Situation | Phrase |
|---|---|
| Service temporarily down | "...is temporarily unavailable. Please try again later." |
| Rate limited | "Please wait [N] seconds before retrying." or "Please try again in [N] minutes." |
| Missing required field | "...required. Include it in [where]." |
| Not found | "...not found. It may have been [reason]." |
| Billing unavailable | "Billing is not available at this time." |
| Generic 500 | "An unexpected error occurred. Please try again later." |
| Upgrade nudge | "Upgrade at /billing/checkout for more credits." |

## Error Response Format

All API errors follow this JSON structure:

```json
{
  "error": "Human-readable error message",
  "code": "SCREAMING_SNAKE_CASE",
  "requestId": "uuid-for-support-correlation",
  "details": [{ "field": "name", "message": "..." }]
}
```

- `error` — Always present. Human-readable, actionable message.
- `code` — Always present. Machine-readable error code for programmatic handling.
- `requestId` — Present on error responses from middleware (authenticate 401s, validation 400s, billing-guard 429s) and all 500s (error-handler, sendRouteError). Populated from `req.id` when available. Users can reference this when contacting support.
- `details` — Present only on validation errors (VALIDATION_ERROR). Array of per-field issues.

## Error Code Reference

### Authentication (401)
| Code | Trigger | Message |
|---|---|---|
| `MISSING_API_KEY` | No API key in header or query | API key required. Include it in the X-API-KEY header or apiKey query parameter. |
| `INVALID_API_KEY` | Key not found or revoked | Invalid or revoked API key. Sign up at /billing/signup for a new key. |
| `AUTH_ERROR` | Firestore lookup failed | Authentication service is temporarily unavailable. Please try again later. |

### Authorization (403)
| Code | Trigger | Message |
|---|---|---|
| `ADMIN_DENIED` | Missing or wrong X-Admin-Key | Admin access required. Provide a valid X-Admin-Key header. |

### Validation (400)
| Code | Trigger | Message |
|---|---|---|
| `VALIDATION_ERROR` | Zod schema validation failed | Request validation failed. Check the details field for specific issues. |

### Rate Limiting (429)
| Code | Trigger | Message |
|---|---|---|
| `RATE_LIMITED` | Per-tier rate limit exceeded | Rate limit exceeded. Please wait 60 seconds before retrying. Check the Retry-After header for details. |
| `RATE_LIMITED` | Signup rate limit exceeded | Too many signup attempts. Please try again in 15 minutes. |
| `RATE_LIMITED` | Billing rate limit exceeded | Too many billing requests. Please try again in 15 minutes. |
| `MONTHLY_LIMIT_EXCEEDED` | Monthly credits exhausted | Monthly credit limit of {N} screenshots reached for the {tier} tier. Upgrade at /billing/checkout for more credits, or wait until next month. |

### Not Found (404)
| Code | Trigger | Message |
|---|---|---|
| `SCREENSHOT_FAILED` / `FETCH_FAILED` | Tweet ID not found | Tweet not found or is no longer available |
| `KEY_NOT_FOUND` | Admin revoke of nonexistent key | API key not found. It may have already been revoked. |

### Billing (5xx)
| Code | Trigger | Message |
|---|---|---|
| `BILLING_NOT_CONFIGURED` | Stripe not set up (503) | Billing is not available at this time. |
| `SIGNUP_FAILED` | Signup error (500) | Unable to complete signup at this time. Please try again later. |
| `CHECKOUT_FAILED` | Checkout session error (500) | Unable to start checkout. Please verify your email and try again. |
| `PORTAL_FAILED` | Portal session error (500) | Unable to open billing portal. Please verify your email and try again. |
| `USAGE_STATS_FAILED` | Usage query error (500) | Unable to retrieve usage data at this time. Please try again later. |

### Rendering
| Code | Trigger | Message |
|---|---|---|
| `SCREENSHOT_FAILED` | Render/fetch error (varies) | Varies by root cause (tweet not found, rate limited, or generic 500) |
| `RENDER_TIMEOUT` | Render exceeds dynamic timeout (504) | This tweet took too long to render. Tweets with many large images may exceed the time limit. Try setting hideMedia=true or using a different tweet. |
| `URL_NOT_CONFIGURED` | URL response without GCS (503) | URL response mode is not available. Use "image" or "base64" response type instead. |

### Batch (400 / 429)
| Code | Trigger | Message |
|---|---|---|
| `BATCH_LIMIT_EXCEEDED` | Batch size exceeds tier limit (400) | Batch size {N} exceeds the limit of {M} for the {tier} tier. Reduce the number of URLs or upgrade at /billing/checkout. |
| `MONTHLY_LIMIT_EXCEEDED` | Not enough credits for batch (429) | Batch of {N} screenshots would exceed the monthly credit limit. {R} credits remaining for the {tier} tier. Reduce the batch size or upgrade at /billing/checkout. |
| `BATCH_SCREENSHOT_FAILED` | Unexpected batch processing error (500) | An unexpected error occurred. Please try again later. |

Per-item error codes in the results array:
| Code | Trigger | Message |
|---|---|---|
| `RENDER_FAILED` | Individual tweet render/fetch failed | Varies per root cause (tweet not found, or generic rendering failed) |
| `RENDER_TIMEOUT` | Individual tweet render timeout | This tweet took too long to render. |
| `URL_NOT_CONFIGURED` | URL response without GCS | URL response mode is not available. |

### Webhook
| Code | Trigger | Message |
|---|---|---|
| `WEBHOOK_NOT_CONFIGURED` | Webhook secret not set | Webhook endpoint not configured |
| `MISSING_SIGNATURE` | No stripe-signature header | Missing stripe-signature header |
| `WEBHOOK_FAILED` | Signature/processing error | Webhook signature verification failed |

### Demo (429 / 504)
| Code | Trigger | Message |
|---|---|---|
| `DEMO_RATE_LIMITED` | Demo IP rate limit (5/min) | Demo rate limit reached (5 requests/min). Sign up for an API key at /billing/signup for higher limits. |
| `RENDER_TIMEOUT` | Demo render exceeds dynamic timeout (504) | This tweet took too long to render. Tweets with many large images may exceed the time limit. Try checking "Hide media" or using a different tweet. |
| `DEMO_SCREENSHOT_FAILED` | Demo render/fetch error (varies) | Varies by root cause (via sendRouteError) |

### Internal (500)
| Code | Trigger | Message |
|---|---|---|
| `INTERNAL_ERROR` | Unhandled error (global handler) | An unexpected error occurred. Please try again later. |
| `STREAM_ERROR` | Request body stream error | Request body could not be read. Please retry. |

## Admin-Specific Errors (500)
| Code | Trigger | Message |
|---|---|---|
| `KEY_CREATE_FAILED` | Key creation error | Unable to create API key. Please try again. |
| `KEY_LIST_FAILED` | Key listing error | Unable to retrieve API keys. Please try again. |
| `KEY_REVOKE_FAILED` | Key revocation error | Unable to revoke API key. Please try again. |
| `USAGE_STATS_FAILED` | Usage stats error | Unable to retrieve usage statistics. Please try again. |
