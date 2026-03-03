/**
 * Global Express error handler.
 * Catches unhandled errors and returns a clean 500 response.
 */

export function errorHandler(logger) {
  return (err, req, res, _next) => {
    logger.error({ err, method: req.method, path: req.path }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
  };
}
