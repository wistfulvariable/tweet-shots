/**
 * Generic Zod validation middleware.
 * Validates req.body or req.query against a schema, sets req.validated on success.
 */

/**
 * @param {import('zod').ZodSchema} schema
 * @param {'body' | 'query'} source
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return res.status(400).json({
        error: 'Request validation failed. Check the details field for specific issues.',
        code: 'VALIDATION_ERROR',
        details: errors,
      });
    }
    req.validated = result.data;
    next();
  };
}
