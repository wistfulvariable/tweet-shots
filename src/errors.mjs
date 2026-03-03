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
 */
export function sendRouteError(res, err, code) {
  const status = err instanceof AppError ? err.statusCode : 500;
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
    code,
  });
}
