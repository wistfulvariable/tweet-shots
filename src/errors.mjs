/**
 * Application-level error class with HTTP status code.
 * Thrown from core.mjs for client errors (bad input, tweet not found).
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
