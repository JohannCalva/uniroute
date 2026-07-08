import type { Request } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { API_ROUTES, SERVICE_REGISTRY } from '@uniroute/shared';

type ServiceName = keyof typeof SERVICE_REGISTRY;

function findServiceForRequest(req: Request): ServiceName | null {
  const originalUrl = req.originalUrl;

  const matchedRoute = Object.keys(API_ROUTES)
    .sort((a, b) => b.length - a.length)
    .find((routePrefix) => originalUrl.startsWith(routePrefix));

  if (!matchedRoute) {
    return null;
  }

  return API_ROUTES[matchedRoute] as ServiceName;
}

export function createGatewayProxy() {
  return createProxyMiddleware({
    target: 'http://localhost',
    changeOrigin: true,
    ws: true,

    /**
     * Selecciona dinámicamente el servicio destino según el path.
     * Las rutas vienen desde packages/shared.
     */
    router: (req) => {
      const serviceName = findServiceForRequest(req as Request);

      if (!serviceName) {
        return 'http://localhost';
      }

      return SERVICE_REGISTRY[serviceName];
    },

    /**
     * Importante:
     * Express recorta /api/v1 cuando usamos app.use('/api/v1', ...).
     * Con esto reenviamos el path completo original.
     *
     * Ejemplo:
     * Cliente -> /api/v1/usuarios/login
     * Servicio recibe -> /api/v1/usuarios/login
     */
    pathRewrite: (_path, req) => {
      return (req as Request).originalUrl;
    },

    onProxyReq: (proxyReq, req) => {
      const serviceName = findServiceForRequest(req as Request);

      proxyReq.setHeader('x-gateway', 'uniroute-api-gateway');

      if (serviceName) {
        proxyReq.setHeader('x-target-service', serviceName);
      }
    },

    onProxyRes: (proxyRes) => {
      proxyRes.headers['x-powered-by'] = undefined;
    },

    onError: (err, _req, res) => {
      console.error('[api-gateway] proxy error:', err.message);

      if (!res.headersSent) {
        res.writeHead(502, {
          'Content-Type': 'application/json',
        });
      }

      res.end(
        JSON.stringify({
          error: 'No se pudo conectar con el servicio interno.',
          code: 'BAD_GATEWAY',
        }),
      );
    },
  });
}