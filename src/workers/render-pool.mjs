/**
 * Worker thread pool for CPU-intensive Satori + Resvg rendering.
 * Prevents the main Express thread from blocking during renders.
 *
 * - Distributes work across N workers (default: cpus - 1, min 2)
 * - Queues tasks when all workers are busy
 * - Auto-replaces crashed workers
 * - Supports graceful shutdown via pool.shutdown()
 */

import { Worker } from 'worker_threads';
import { cpus } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, 'render-worker.mjs');

/**
 * @param {object} [options]
 * @param {number} [options.size] - Number of workers (default: cpus - 1, min 2)
 * @param {object} [options.logger] - pino logger
 * @returns {{ render: Function, shutdown: Function }}
 */
export function createRenderPool({ size, logger } = {}) {
  const poolSize = size || Math.max(2, cpus().length - 1);
  const workers = [];
  const idle = [];
  const pending = new Map();   // id → { resolve, reject }
  const queue = [];            // waiting tasks
  let taskIdCounter = 0;
  let shuttingDown = false;

  /** Assign queued tasks to idle workers until one side is exhausted. */
  function drainQueue() {
    while (idle.length > 0 && queue.length > 0) {
      dispatch(idle.shift(), queue.shift());
    }
  }

  function spawnWorker() {
    const worker = new Worker(WORKER_PATH);

    worker.on('message', ({ id, result, error }) => {
      const task = pending.get(id);
      if (!task) return;
      pending.delete(id);

      if (error) {
        task.reject(new Error(error));
      } else {
        // Re-wrap transferred ArrayBuffer into a Buffer
        if (result?.data && result.data instanceof ArrayBuffer) {
          result.data = Buffer.from(result.data);
        } else if (result?.data?.buffer instanceof ArrayBuffer) {
          result.data = Buffer.from(result.data.buffer);
        }
        task.resolve(result);
      }

      // Worker is now free — either pick up queued work or go idle
      idle.push(worker);
      drainQueue();
    });

    worker.on('error', (err) => {
      logger?.error({ err }, 'Render worker error');
      replaceWorker(worker);
    });

    worker.on('exit', (code) => {
      if (code !== 0 && !shuttingDown) {
        logger?.warn({ code }, 'Render worker exited unexpectedly');
        replaceWorker(worker);
      }
    });

    return worker;
  }

  function replaceWorker(deadWorker) {
    const idx = workers.indexOf(deadWorker);
    if (idx !== -1) workers.splice(idx, 1);

    const idleIdx = idle.indexOf(deadWorker);
    if (idleIdx !== -1) idle.splice(idleIdx, 1);

    // Reject any pending tasks assigned to this worker
    for (const [id, task] of pending.entries()) {
      if (task.worker === deadWorker) {
        pending.delete(id);
        task.reject(new Error('Worker crashed during render'));
      }
    }

    if (!shuttingDown) {
      const replacement = spawnWorker();
      workers.push(replacement);
      idle.push(replacement);
      drainQueue();
    }
  }

  function dispatch(worker, { id, tweet, options, resolve, reject }) {
    pending.set(id, { resolve, reject, worker });
    worker.postMessage({ id, tweet, options });
  }

  /**
   * Render a tweet to image via the worker pool.
   * @param {object} tweet - Tweet data object
   * @param {object} options - Render options
   * @returns {Promise<{ data: Buffer, contentType: string, format: string }>}
   */
  function render(tweet, options) {
    if (shuttingDown) {
      return Promise.reject(new Error('Render pool is shutting down'));
    }

    const id = taskIdCounter++;

    return new Promise((resolve, reject) => {
      const task = { id, tweet, options, resolve, reject };

      if (idle.length > 0) {
        const worker = idle.shift();
        dispatch(worker, task);
      } else {
        queue.push(task);
      }
    });
  }

  /**
   * Gracefully shut down all workers.
   */
  async function shutdown() {
    shuttingDown = true;

    // Reject queued tasks
    for (const task of queue) {
      task.reject(new Error('Render pool shutting down'));
    }
    queue.length = 0;

    // Terminate all workers
    await Promise.all(workers.map(w => w.terminate()));
    workers.length = 0;
    idle.length = 0;
  }

  // Initialize worker pool
  for (let i = 0; i < poolSize; i++) {
    const w = spawnWorker();
    workers.push(w);
    idle.push(w);
  }

  logger?.info({ poolSize }, 'Render worker pool started');

  return { render, shutdown, get size() { return workers.length; } };
}
