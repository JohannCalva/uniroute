export const SERVICE_REGISTRY = {
  'usuarios-service': process.env.USUARIOS_SERVICE_URL || 'http://usuarios-service:3001',
  'rutas-service': process.env.RUTAS_SERVICE_URL || 'http://rutas-service:3002',
  'despachos-service': process.env.DESPACHOS_SERVICE_URL || 'http://despachos-service:3004',
} as const;

export const API_ROUTES: Record<string, string> = {
  '/api/v1/usuarios': 'usuarios-service',
  '/api/v1/rutas': 'rutas-service',
  '/api/v1/buses': 'rutas-service',
  '/api/v1/paradas': 'rutas-service',
  '/api/v1/viajes': 'rutas-service',
  '/api/v1/despachos': 'despachos-service',
};
