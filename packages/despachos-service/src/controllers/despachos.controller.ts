import type { Request, Response } from 'express';
import { despachosService } from '../services/despachos.service';
import {
  iniciarViajeSchema,
  estadoBusSchema,
  gpsUpdateSchema,
  abordajeSchema,
  proximidadSchema,
  finalizarViajeSchema
} from '../schemas';

// Note: we can cast req to any or import the AuthenticatedRequest if we defined it locally
export const iniciarViaje = async (req: any, res: Response) => {
  try {
    const { busId, rutaId } = iniciarViajeSchema.parse(req.body);
    const driverId = req.authUser.id;

    const result = await despachosService.iniciarViaje(busId, rutaId, driverId);
    res.status(201).json(result);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors, code: 'VALIDATION_ERROR' });
    }
    if (error.message === 'Bus ya tiene viaje activo') {
      return res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
    }
    res.status(500).json({ error: error.message, code: 'INTERNAL_ERROR' });
  }
};

export const cambiarEstado = async (req: any, res: Response) => {
  try {
    const { busId, status, lamportClock } = estadoBusSchema.parse(req.body);

    const result = await despachosService.cambiarEstado(busId, status, lamportClock);
    res.status(202).json(result);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors, code: 'VALIDATION_ERROR' });
    }
    if (error.message === 'Bus no tiene viaje activo') {
      return res.status(404).json({ error: error.message, code: 'NOT_FOUND' });
    }
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
};

export const actualizarGps = async (req: any, res: Response) => {
  try {
    const { busId, latitude, longitude } = gpsUpdateSchema.parse(req.body);

    await despachosService.actualizarGps(busId, latitude, longitude);
    res.status(200).json({ received: true });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors, code: 'VALIDATION_ERROR' });
    }
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
};

export const registrarAbordaje = async (req: any, res: Response) => {
  try {
    const { busId, boardingToken } = abordajeSchema.parse(req.body);

    const result = await despachosService.registrarAbordaje(busId, boardingToken);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors, code: 'VALIDATION_ERROR' });
    }
    const status = error.message.includes('ya abordó') ? 409 : 400;
    res.status(status).json({ error: error.message, code: 'BAD_REQUEST' });
  }
};

export const alertaProximidad = async (req: any, res: Response) => {
  try {
    const { rutaId, latitude, longitude } = proximidadSchema.parse(req.body);
    const studentId = req.authUser.id;

    const result = await despachosService.alertaProximidad(studentId, rutaId, latitude, longitude);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors, code: 'VALIDATION_ERROR' });
    }
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
};

export const finalizarViaje = async (req: any, res: Response) => {
  try {
    const { busId } = finalizarViajeSchema.parse(req.body);

    const result = await despachosService.finalizarViaje(busId);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: error.errors, code: 'VALIDATION_ERROR' });
    }
    res.status(400).json({ error: error.message, code: 'BAD_REQUEST' });
  }
};

export const obtenerEstadoBus = async (req: any, res: Response) => {
  try {
    const { busId } = req.params;

    const result = await despachosService.obtenerEstadoBus(busId);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(404).json({ error: error.message, code: 'NOT_FOUND' });
  }
};
