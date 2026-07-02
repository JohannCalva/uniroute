import { z } from 'zod';

export const iniciarViajeSchema = z.object({
  busId: z.string().uuid(),
  rutaId: z.string().uuid(),
});

export const estadoBusSchema = z.object({
  busId: z.string().uuid(),
  status: z.enum(['AT_STOP', 'DEPARTING', 'EN_ROUTE', 'FULL', 'ARRIVED']),
  lamportClock: z.number().int().min(0),
});

export const gpsUpdateSchema = z.object({
  busId: z.string().uuid(),
  latitude: z.number(),
  longitude: z.number(),
});

export const abordajeSchema = z.object({
  busId: z.string().uuid(),
  boardingToken: z.string(),
});

export const proximidadSchema = z.object({
  rutaId: z.string().uuid(),
  latitude: z.number(),
  longitude: z.number(),
});

export const finalizarViajeSchema = z.object({
  busId: z.string().uuid(),
});
