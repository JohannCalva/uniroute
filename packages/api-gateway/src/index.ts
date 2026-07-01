import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';

import { createGatewayProxy } from './proxy.js';
import { errorHandler } from './middleware/error-handler.js';

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');

/**
 * Middlewares base de seguridad y observabilidad.
 * En esta fase todavía NO aplicamos JWT.
 */
app.use(helmet());

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Demasiadas peticiones. Intenta nuevamente más tarde.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
  }),
);

app.use(morgan('dev'));

/**
 * Health check del Gateway.
 */
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'api-gateway',
  });
});

/**
 * Proxy real hacia microservicios internos.
 * Mantiene el path completo /api/v1/... para respetar los contratos REST.
 */
app.use('/api/v1', createGatewayProxy());

/**
 * Fallback para rutas no encontradas fuera del proxy.
 */
app.use((_req, res) => {
  res.status(404).json({
    error: 'Route not found',
    code: 'ROUTE_NOT_FOUND',
  });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`api-gateway running on port ${PORT}`);
});