/**
 * Unit tests for render-pool (src/workers/render-pool.mjs).
 * Tests worker pool lifecycle, task dispatching, and error handling.
 * Mocks worker_threads to avoid actual OS thread creation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// ─── Worker Mock ─────────────────────────────────────────────────────────────

class MockWorker extends EventEmitter {
  constructor() {
    super();
    this.terminated = false;
    this.messages = [];
  }

  postMessage(msg) {
    this.messages.push(msg);
    // Auto-resolve after a tick to simulate async rendering
    if (this._autoResolve) {
      setImmediate(() => {
        const resultBuffer = Buffer.from('fake-png-data');
        this.emit('message', {
          id: msg.id,
          result: {
            data: resultBuffer.buffer.slice(
              resultBuffer.byteOffset,
              resultBuffer.byteOffset + resultBuffer.byteLength
            ),
            contentType: 'image/png',
            format: 'png',
          },
        });
      });
    }
  }

  async terminate() {
    this.terminated = true;
    return 0;
  }

  enableAutoResolve() {
    this._autoResolve = true;
  }
}

// Track workers created by the mock constructor
const createdWorkers = [];
let workerFactory = () => {
  const w = new MockWorker();
  w.enableAutoResolve();
  return w;
};

vi.mock('worker_threads', () => {
  // Use a real class so `new Worker()` works
  return {
    Worker: class ProxiedWorker extends EventEmitter {
      constructor(...args) {
        super();
        const target = workerFactory();
        createdWorkers.push(target);
        // Copy EventEmitter methods from target to this
        Object.assign(this, target);
        // Re-register listeners on the target and forward
        this._target = target;
        this.postMessage = target.postMessage.bind(target);
        this.terminate = target.terminate.bind(target);
        this.on = target.on.bind(target);
        this.emit = target.emit.bind(target);
        this.removeListener = target.removeListener.bind(target);
        this.terminated = false;
        Object.defineProperty(this, 'terminated', {
          get: () => target.terminated,
        });
        this.messages = target.messages;
      }
    },
  };
});

vi.mock('os', () => ({
  cpus: () => Array(4).fill({}), // 4 CPUs → pool size of 3
}));

const { createRenderPool } = await import('../../src/workers/render-pool.mjs');

// ─── Tests ───────────────────────────────────────────────────────────────────

const mockLogger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  createdWorkers.length = 0;
  workerFactory = () => {
    const w = new MockWorker();
    w.enableAutoResolve();
    return w;
  };
});

describe('createRenderPool', () => {
  it('creates pool with configured size', () => {
    const pool = createRenderPool({ size: 3, logger: mockLogger });
    expect(pool.size).toBe(3);
    expect(createdWorkers).toHaveLength(3);
    pool.shutdown();
  });

  it('defaults pool size to cpus - 1 with min 2', () => {
    // 4 CPUs → max(2, 4-1) = 3
    const pool = createRenderPool({ logger: mockLogger });
    expect(pool.size).toBe(3);
    pool.shutdown();
  });

  it('logs pool started message', () => {
    const pool = createRenderPool({ size: 2, logger: mockLogger });
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ poolSize: 2 }),
      'Render worker pool started'
    );
    pool.shutdown();
  });

  it('returns render and shutdown functions', () => {
    const pool = createRenderPool({ size: 2, logger: mockLogger });
    expect(typeof pool.render).toBe('function');
    expect(typeof pool.shutdown).toBe('function');
    pool.shutdown();
  });
});

describe('pool.render', () => {
  it('dispatches task to an idle worker and returns result', async () => {
    const pool = createRenderPool({ size: 2, logger: mockLogger });

    const result = await pool.render({ text: 'test' }, { format: 'png' });

    expect(result).toBeDefined();
    expect(result.contentType).toBe('image/png');
    expect(result.format).toBe('png');
    expect(Buffer.isBuffer(result.data)).toBe(true);

    await pool.shutdown();
  });

  it('converts ArrayBuffer result.data to Buffer', async () => {
    const pool = createRenderPool({ size: 1, logger: mockLogger });

    const result = await pool.render({ text: 'test' }, { format: 'png' });

    expect(Buffer.isBuffer(result.data)).toBe(true);

    await pool.shutdown();
  });

  it('queues tasks when all workers are busy', async () => {
    // Create pool with 1 worker, manually control resolution
    const manualWorker = new MockWorker();
    workerFactory = () => manualWorker;

    const pool = createRenderPool({ size: 1, logger: mockLogger });

    // First task dispatches immediately
    const task1 = pool.render({ text: 'first' }, {});
    expect(manualWorker.messages).toHaveLength(1);

    // Second task should be queued (worker is busy)
    const task2 = pool.render({ text: 'second' }, {});
    expect(manualWorker.messages).toHaveLength(1); // still 1, queued

    // Resolve first task
    const resultBuffer = Buffer.from('result1');
    manualWorker.emit('message', {
      id: manualWorker.messages[0].id,
      result: { data: resultBuffer.buffer, contentType: 'image/png', format: 'png' },
    });

    await task1;

    // Second task should now be dispatched
    expect(manualWorker.messages).toHaveLength(2);

    // Resolve second task
    manualWorker.emit('message', {
      id: manualWorker.messages[1].id,
      result: { data: resultBuffer.buffer, contentType: 'image/png', format: 'png' },
    });

    await task2;
    await pool.shutdown();
  });

  it('rejects task when worker returns error', async () => {
    const errorWorker = new MockWorker();
    errorWorker.postMessage = function (msg) {
      this.messages.push(msg);
      setImmediate(() => {
        this.emit('message', { id: msg.id, error: 'Render failed: out of memory' });
      });
    };
    workerFactory = () => errorWorker;

    const pool = createRenderPool({ size: 1, logger: mockLogger });

    await expect(pool.render({ text: 'test' }, {})).rejects.toThrow('Render failed: out of memory');

    await pool.shutdown();
  });

  it('rejects when pool is shutting down', async () => {
    const pool = createRenderPool({ size: 1, logger: mockLogger });
    await pool.shutdown();

    await expect(pool.render({ text: 'test' }, {})).rejects.toThrow('Render pool is shutting down');
  });
});

describe('pool.shutdown', () => {
  it('terminates all workers', async () => {
    const pool = createRenderPool({ size: 3, logger: mockLogger });
    expect(createdWorkers).toHaveLength(3);

    await pool.shutdown();

    for (const w of createdWorkers) {
      expect(w.terminated).toBe(true);
    }
  });

  it('rejects queued tasks on shutdown', async () => {
    const busyWorker = new MockWorker();
    // Never auto-resolve — keeps worker busy
    workerFactory = () => busyWorker;

    const pool = createRenderPool({ size: 1, logger: mockLogger });

    // First task takes the only worker
    pool.render({ text: 'first' }, {});

    // Second task gets queued
    const task2Promise = pool.render({ text: 'second' }, {});

    // Shutdown should reject the queued task
    await pool.shutdown();

    await expect(task2Promise).rejects.toThrow('Render pool shutting down');
  });
});

describe('worker error recovery', () => {
  it('replaces crashed worker and maintains pool size', () => {
    const pool = createRenderPool({ size: 2, logger: mockLogger });
    expect(createdWorkers).toHaveLength(2);

    // Simulate crash on first worker
    createdWorkers[0].emit('exit', 1);

    // Pool should have spawned a replacement
    expect(createdWorkers).toHaveLength(3);
    expect(pool.size).toBe(2); // Size maintained

    pool.shutdown();
  });

  it('logs worker error', () => {
    const pool = createRenderPool({ size: 1, logger: mockLogger });
    const worker = createdWorkers[createdWorkers.length - 1];

    const err = new Error('Worker OOM');
    worker.emit('error', err);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err }),
      'Render worker error'
    );

    pool.shutdown();
  });

  it('logs unexpected exit with code', () => {
    const pool = createRenderPool({ size: 1, logger: mockLogger });
    const worker = createdWorkers[createdWorkers.length - 1];

    worker.emit('exit', 137);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: 137 }),
      'Render worker exited unexpectedly'
    );

    pool.shutdown();
  });

  it('does not replace worker during shutdown', async () => {
    const pool = createRenderPool({ size: 1, logger: mockLogger });
    const initialCount = createdWorkers.length;

    await pool.shutdown();

    // Simulate exit after shutdown (code 0 = clean exit during shutdown)
    createdWorkers[0].emit('exit', 0);

    // Should not spawn replacement during shutdown
    expect(createdWorkers.length).toBe(initialCount);
  });

  it('handles result.data as Uint8Array with buffer property', async () => {
    const customWorker = new MockWorker();
    customWorker.postMessage = function (msg) {
      this.messages.push(msg);
      setImmediate(() => {
        const buf = Buffer.from('typed-array-data');
        this.emit('message', {
          id: msg.id,
          result: {
            data: new Uint8Array(buf),
            contentType: 'image/png',
            format: 'png',
          },
        });
      });
    };
    workerFactory = () => customWorker;

    const pool = createRenderPool({ size: 1, logger: mockLogger });
    const result = await pool.render({ text: 'test' }, {});

    expect(Buffer.isBuffer(result.data)).toBe(true);

    await pool.shutdown();
  });
});
