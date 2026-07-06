import { Router } from 'express';
import { requireGatewayAuth, requireRole } from '../middleware/auth-context';
import {
  iniciarViaje,
  cambiarEstado,
  actualizarGps,
  registrarAbordaje,
  alertaProximidad,
  finalizarViaje,
  obtenerEstadoBus
} from '../controllers/despachos.controller';

const router = Router();

// Driver routes
router.post('/viaje/iniciar', requireGatewayAuth, requireRole(['DRIVER']), iniciarViaje);
router.post('/estado', requireGatewayAuth, requireRole(['DRIVER']), cambiarEstado);
router.post('/gps', requireGatewayAuth, requireRole(['DRIVER']), actualizarGps);
router.post('/abordaje', requireGatewayAuth, requireRole(['DRIVER']), registrarAbordaje);
router.post('/viaje/finalizar', requireGatewayAuth, requireRole(['DRIVER']), finalizarViaje);

// Student routes
router.post('/proximidad', requireGatewayAuth, requireRole(['STUDENT']), alertaProximidad);

// Common routes
router.get('/bus/:busId/estado', requireGatewayAuth, obtenerEstadoBus);

export default router;
