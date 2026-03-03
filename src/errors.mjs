/**
 * Application-level error class with HTTP status code.
 * Thrown from core modules for client errors (bad input, tweet not found).
 * Route handlers distinguish AppError (→ statusCode) from plain Error (→ 500).
 */
export class AppError extends Error {
  constructor(message, statusCode = 400, code) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    if (code) this.code = code;
  }
}

/**
 * Send a standardized error JSON response.
 * AppError → uses its statusCode + message; plain Error → generic 500.
 * @param {object} res - Express response object
 * @param {Error} err - The error to send
 * @param {string} code - SCREAMING_SNAKE_CASE error code
 * @param {object} [logger] - Optional pino logger for server-side logging of 500s
 */
export function sendRouteError(res, err, code, logger) {
  const status = err instanceof AppError ? err.statusCode : 500;
  if (status >= 500 && logger) {
    logger.error({ err, code }, 'Internal error in route handler');
  }
  const body = {
    error: status >= 500 ? 'An unexpected error occurred. Please try again later.' : err.message,
    code,
  };
  const reqId = res.req?.id;
  if (reqId) body.requestId = reqId;
  res.status(status).json(body);
}
