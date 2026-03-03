# Testing

## Framework & Config

Vitest 4.0 with `restoreMocks: true` (auto-cleanup). Test files: `tests/**/*.test.mjs`.

```bash
npm test                  # All tests
npm run test:unit         # tests/unit/ only
npm run test:integration  # tests/integration/ only
```

Timeouts: 10s for both tests and hooks. All tests must be deterministic — no network calls.

## Firestore Mock Pattern

All services depend on `src/services/firestore.mjs`. Mock it before importing the module under test:

```js
import { createFirestoreMock } from '../helpers/firestore-mock.mjs';
const mock = createFirestoreMock();

vi.mock('../../src/services/firestore.mjs', () => ({
  apiKeysCollection: mock.apiKeysCollection,
  usageCollection: mock.usageCollection,
  customersCollection: mock.customersCollection,
  subscriptionsCollection: mock.subscriptionsCollection,
  FieldValue: mock.FieldValue,
}));

// Dynamic import AFTER mock setup
const { myFunction } = await import('../../src/services/my-service.mjs');
```

The mock uses in-memory `Map` stores. Clear between tests with `mock.collections.<name>._store.clear()`.

`FieldValue.increment(n)` and `FieldValue.serverTimestamp()` return sentinel objects `{ _type, _value }` — the mock doc/collection classes resolve them on set/update.

## Integration Test Pattern

Spin up a real Express app on port 0 (auto-assigned), use `fetch()` for HTTP calls:

```js
let app, server, baseUrl;
beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(myRoutes({ config: TEST_CONFIG, logger: mockLogger }));
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});
afterAll(() => server?.close());
```

## Test Fixtures

`tests/helpers/test-fixtures.mjs` exports: `TEST_CONFIG`, `MOCK_TWEET`, `MOCK_KEY_DATA`, `MOCK_API_KEY`, `MOCK_PRO_KEY_DATA`, `MOCK_PRO_API_KEY`.

`TEST_CONFIG.ADMIN_KEY` = `'test-admin-key-long-enough'` (meets 16-char minimum).

## Mocking core.mjs (Satori / Resvg)

When testing code that calls `renderTweetToImage` or imports from `core.mjs`:

```js
// Satori — mock default export
vi.mock('satori', () => ({ default: vi.fn(async () => '<svg>mock</svg>') }));

// Resvg — MUST use function (not arrow) so `new` works
vi.mock('@resvg/resvg-js', () => {
  const MockResvg = vi.fn(function () {
    this.render = () => ({ asPng: () => Buffer.from('fake-png-data') });
  });
  return { Resvg: MockResvg };
});

// satori-html
vi.mock('satori-html', () => ({
  html: vi.fn((input) => ({ type: 'div', props: { children: input } })),
}));
```

- `renderTweetToImage` mutates the tweet object in-place (replaces URLs with base64) — use `structuredClone(MOCK_TWEET)` per test
- `loadFonts` has a module-level `_cachedFonts` cache — use `vi.resetModules()` if testing cache behavior
- Mock `global.fetch` for `fetchTweet`, `fetchImageAsBase64`, `translateText`

## Screenshot Route Integration Tests

Wire via DI with real `authenticate` + `billingGuard` (backed by Firestore mock) and passthrough rate limiter:

```js
app.use(screenshotRoutes({
  authenticate: authenticate(mockLogger),
  applyRateLimit: (req, res, next) => next(),
  billingGuard: billingGuard(mockLogger),
  renderPool: null,  // falls back to mocked renderTweetToImage
  config: TEST_CONFIG,
  logger: mockLogger,
}));
```

Mock `core.mjs` exports (`extractTweetId`, `fetchTweet`, `renderTweetToImage`) and `storage.mjs` (`upload`). Seed `apiKeys` and `usage` mock stores in `beforeEach`. Re-set mock implementations after `vi.clearAllMocks()`.

## Pitfalls

- Must `vi.mock()` before dynamic `await import()` — Vitest hoists mocks but dynamic imports respect execution order
- `mock.collections.<name>._store` is shared across tests in the same file — always clear in `beforeEach`
- Integration tests bind to `127.0.0.1` (not `0.0.0.0`) to avoid firewall prompts on Windows
- Resvg mock must use `vi.fn(function() {})` not `vi.fn().mockImplementation(() => {})` — arrow functions can't be `new`'d
- After `vi.clearAllMocks()`, re-set mock implementations or mocks return `undefined`
