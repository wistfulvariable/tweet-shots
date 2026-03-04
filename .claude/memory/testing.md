# Testing

## Framework & Config

Vitest 4.0 with `restoreMocks: true`. Tests: `tests/**/*.test.mjs`. Timeouts: 10s. All deterministic — no network calls.

```bash
npm test                  # All (~670 tests, ~2s)
npm run test:unit         # tests/unit/ only (19 files)
npm run test:integration  # tests/integration/ only (10 files)
```

## Firestore Mock

All services depend on `src/services/firestore.mjs`. Use `createFirestoreMock()` from `tests/helpers/firestore-mock.mjs`:

```js
const mock = createFirestoreMock();
vi.mock('../../src/services/firestore.mjs', () => ({
  apiKeysCollection: mock.apiKeysCollection, usageCollection: mock.usageCollection,
  customersCollection: mock.customersCollection, subscriptionsCollection: mock.subscriptionsCollection,
  FieldValue: mock.FieldValue,
}));
const { myFunction } = await import('../../src/services/my-service.mjs'); // AFTER mock
```

In-memory `Map` stores — clear with `mock.collections.<name>._store.clear()` in `beforeEach`. `FieldValue.increment(n)` and `.serverTimestamp()` return sentinels resolved on set/update.

## Integration Test Pattern

Express on port 0, `fetch()` for HTTP. Wire routes via DI with real middleware + passthrough rate limiter:

```js
app.use(screenshotRoutes({
  authenticate: authenticate(mockLogger), applyRateLimit: (req, res, next) => next(),
  billingGuard: billingGuard(mockLogger), renderPool: null, config: TEST_CONFIG, logger: mockLogger,
}));
```

Bind to `127.0.0.1` (not `0.0.0.0`) to avoid firewall prompts on Windows. Close server in `afterAll`.

## Test Fixtures

`tests/helpers/test-fixtures.mjs`: `TEST_CONFIG`, `MOCK_TWEET`, `MOCK_KEY_DATA`, `MOCK_API_KEY`, `MOCK_PRO_KEY_DATA`, `MOCK_PRO_API_KEY`, `MOCK_BUSINESS_KEY_DATA`, `MOCK_BUSINESS_API_KEY`. Admin key: `'test-admin-key-long-enough'` (16-char min).

## Mocking Render Dependencies

```js
vi.mock('satori', () => ({ default: vi.fn(async () => '<svg>mock</svg>') }));
vi.mock('@resvg/resvg-js', () => {
  const MockResvg = vi.fn(function () { // MUST be function, not arrow (new)
    this.render = () => ({ asPng: () => Buffer.from('fake-png-data') });
  });
  return { Resvg: MockResvg };
});
vi.mock('../../tweet-emoji.mjs', () => ({
  fetchEmoji: vi.fn(async () => 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='),
  emojiToCodepoint: vi.fn(() => '1f600'), clearEmojiCache: vi.fn(), getEmojiCacheSize: vi.fn(() => 0),
}));
vi.mock('../../tweet-fonts.mjs', () => ({
  loadLanguageFont: vi.fn(() => undefined),
  getSupportedLanguages: vi.fn(() => ['ja-JP', 'ko-KR', 'zh-CN']), clearFontCache: vi.fn(),
}));
```

Mock sub-modules directly (`tweet-fetch.mjs`, `tweet-render.mjs`), not `core.mjs`. Use `structuredClone(MOCK_TWEET)` per test. Call `clearEmojiCache()` / `clearFontCache()` in `beforeEach` when testing those modules directly.

## Batch Route Testing

`batch-screenshot.test.mjs`: no `billingGuard` in middleware chain (batch calls `checkAndReserveCredits()` internally). CSV upload tests use manually-built multipart bodies. Batch limit tests need all three tier fixtures (free/pro/business).

## Pitfalls

- `vi.mock()` before dynamic `await import()` — Vitest hoists but dynamic imports respect execution order
- `mock.collections.<name>._store` shared across tests — always clear in `beforeEach`
- After `vi.clearAllMocks()`, re-set mock implementations or mocks return `undefined`
- Resvg mock must use `function()` not arrow — arrow functions can't be `new`'d
- Separate Express server instances when tests would exhaust rate limit state
