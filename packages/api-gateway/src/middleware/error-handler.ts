import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('[api-gateway] unexpected error:', err);

  res.status(500).json({
    error: 'Error interno del API Gateway.',
    code: 'INTERNAL_GATEWAY_ERROR',
  });
};