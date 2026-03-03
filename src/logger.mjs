/**
 * Structured logging with pino.
 * - Development: pretty-printed with colors
 * - Production: JSON with severity field for GCP Cloud Logging
 */

import pino from 'pino';

export function createLogger(config) {
  const isProduction = config.NODE_ENV === 'production';

  return pino({
    level: isProduction ? 'info' : 'debug',
    ...(isProduction
      ? {
          messageKey: 'message',
          formatters: {
            level(label) {
              return { severity: label.toUpperCase() };
            },
          },
        }
      : {
          transport: { target: 'pino-pretty' },
        }),
  });
}
