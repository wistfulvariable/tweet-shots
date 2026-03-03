/**
 * Global Express error handler.
 * Catches unhandled errors and returns a clean 500 response.
 */

export function errorHandler(logger) {
  return (err, req, res, _next) => {
    const reqId = req.id || req.headers['x-request-id'];
    logger.error({ err, method: req.method, path: req.path, reqId }, 'Unhandled error');
    const body = { error: 'An unexpected error occurred. Please try again later.', code: 'INTERNAL_ERROR' };
    if (reqId) body.requestId = reqId;
    res.status(500).json(body);
  };
}
