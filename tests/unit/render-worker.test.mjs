/**
 * Unit tests for render-worker.mjs — the worker_threads entry point.
 * Mocks parentPort (EventEmitter + postMessage spy) and renderTweetToImage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const fakeParentPort = Object.assign(new EventEmitter(), {
  postMessage: vi.fn(),
});

vi.mock('worker_threads', () => ({
  parentPort: fakeParentPort,
}));

vi.mock('../../tweet-render.mjs', () => ({
  renderTweetToImage: vi.fn(),
}));

// Import the worker — this registers the 'message' listener on fakeParentPort
await import('../../src/workers/render-worker.mjs');
const { renderTweetToImage } = await import('../../tweet-render.mjs');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Emit a message and wait for the async handler to complete. */
async function emitMessage(msg) {
  fakeParentPort.emit('message', msg);
  // Handler is async — flush the microtask queue via a macrotask tick
  await new Promise(resolve => setTimeout(resolve, 0));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('render-worker', () => {
  const fakeTweet = { text: 'Hello world', user: { screen_name: 'test' } };
  const fakeOptions = { theme: 'dark', format: 'png', scale: 1 };

  it('calls renderTweetToImage with received tweet and options', async () => {
    renderTweetToImage.mockResolvedValue({
      data: Buffer.from('png-data'),
      contentType: 'image/png',
      format: 'png',
    });

    await emitMessage({ id: '1', tweet: fakeTweet, options: fakeOptions });

    expect(renderTweetToImage).toHaveBeenCalledWith(fakeTweet, fakeOptions);
  });

  it('posts success message with id, data, contentType, and format', async () => {
    renderTweetToImage.mockResolvedValue({
      data: Buffer.from('test-png-data'),
      contentType: 'image/png',
      format: 'png',
    });

    await emitMessage({ id: 'abc', tweet: fakeTweet, options: fakeOptions });

    expect(fakeParentPort.postMessage).toHaveBeenCalledWith(
      {
        id: 'abc',
        result: {
          data: expect.any(Buffer),
          contentType: 'image/png',
          format: 'png',
        },
      },
      expect.any(Array),
    );
  });

  it('converts non-Buffer result.data to Buffer before posting', async () => {
    const uint8 = new Uint8Array([1, 2, 3, 4]);
    renderTweetToImage.mockResolvedValue({
      data: uint8,
      contentType: 'image/png',
      format: 'png',
    });

    await emitMessage({ id: '2', tweet: fakeTweet, options: fakeOptions });

    const postedResult = fakeParentPort.postMessage.mock.calls[0][0].result;
    expect(Buffer.isBuffer(postedResult.data)).toBe(true);
    expect([...postedResult.data]).toEqual([1, 2, 3, 4]);
  });

  it('transfers buffer via Transferable array (2nd arg to postMessage)', async () => {
    renderTweetToImage.mockResolvedValue({
      data: Buffer.from('transfer-test'),
      contentType: 'image/png',
      format: 'png',
    });

    await emitMessage({ id: '3', tweet: fakeTweet, options: fakeOptions });

    const transferList = fakeParentPort.postMessage.mock.calls[0][1];
    expect(Array.isArray(transferList)).toBe(true);
    expect(transferList.length).toBe(1);
    expect(transferList[0]).toBeInstanceOf(ArrayBuffer);
  });

  it('posts error message with id and err.message on rejection', async () => {
    renderTweetToImage.mockRejectedValue(new Error('Render exploded'));

    await emitMessage({ id: 'err-1', tweet: fakeTweet, options: fakeOptions });

    expect(fakeParentPort.postMessage).toHaveBeenCalledWith({
      id: 'err-1',
      error: 'Render exploded',
    });
  });

  it('posts error message when renderTweetToImage throws synchronously', async () => {
    renderTweetToImage.mockImplementation(() => {
      throw new Error('Sync kaboom');
    });

    await emitMessage({ id: 'err-2', tweet: fakeTweet, options: fakeOptions });

    expect(fakeParentPort.postMessage).toHaveBeenCalledWith({
      id: 'err-2',
      error: 'Sync kaboom',
    });
  });

  it('posts undefined error message when error has no message property', async () => {
    renderTweetToImage.mockRejectedValue({ code: 'UNKNOWN' });

    await emitMessage({ id: 'err-3', tweet: fakeTweet, options: fakeOptions });

    expect(fakeParentPort.postMessage).toHaveBeenCalledWith({
      id: 'err-3',
      error: undefined,
    });
  });

  it('handles SVG format result correctly', async () => {
    renderTweetToImage.mockResolvedValue({
      data: Buffer.from('<svg>test</svg>'),
      contentType: 'image/svg+xml',
      format: 'svg',
    });

    await emitMessage({ id: 'svg-1', tweet: fakeTweet, options: { format: 'svg' } });

    const msg = fakeParentPort.postMessage.mock.calls[0][0];
    expect(msg.result.contentType).toBe('image/svg+xml');
    expect(msg.result.format).toBe('svg');
  });
});
