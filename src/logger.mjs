/**
 * Structured logging with pino.
 * - Development: pretty-printed with colors
 * - Production: JSON with severity field for GCP Cloud Logging
 * - Test: silent (no output)
 *
 * Called with config from server.mjs, or without config from core modules
 * (falls back to process.env.NODE_ENV).
 */

import pino from 'pino';

export function createLogger(config) {
  const nodeEnv = config?.NODE_ENV ?? process.env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  return pino({
    level: isTest ? 'silent' : isProduction ? 'info' : 'debug',
    ...(isProduction
      ? {
          messageKey: 'message',
          formatters: {
            level(label) {
              return { severity: label.toUpperCase() };
            },
          },
        }
      : isTest
        ? {}
        : {
            transport: { target: 'pino-pretty' },
          }),
  });
}
