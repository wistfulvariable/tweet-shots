/**
 * Worker thread entry point for rendering.
 * Each worker imports tweet-render.mjs and renders tweets in isolation,
 * keeping the main thread free for HTTP handling.
 */

import { parentPort } from 'worker_threads';
import { renderTweetToImage } from '../../tweet-render.mjs';

parentPort.on('message', async ({ id, tweet, options }) => {
  try {
    const result = await renderTweetToImage(tweet, options);

    // Transfer the buffer to avoid copying
    const buffer = Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data);
    parentPort.postMessage(
      { id, result: { data: buffer, contentType: result.contentType, format: result.format } },
      [buffer.buffer]
    );
  } catch (err) {
    parentPort.postMessage({ id, error: err.message });
  }
});
