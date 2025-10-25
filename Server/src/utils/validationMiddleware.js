/**
 * Middleware validasi menggunakan Zod.
 * @param {import('zod').ZodSchema} schema - Skema Zod untuk validasi.
 * @returns {import('express').RequestHandler}
 */
const validate = (schema) => (req, res, next) => {
  try {
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    next();
  } catch (error) {
    const { errors } = error;
    return res.status(400).json({
      success: false,
      error: 'Invalid request data',
      details: errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
  }
};

export { validate }; 