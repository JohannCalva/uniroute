export const REDIS_KEYS = {
  busStatus: (busId: string) => `bus:${busId}:status`,
  busAforo: (busId: string) => `bus:${busId}:aforo`,
  busCapacidad: (busId: string) => `bus:${busId}:capacidad`,
  rutaEsperando: (rutaId: string) => `ruta:${rutaId}:esperando`,
  viajeActivo: (viajeId: string) => `viaje:${viajeId}:activo`,
} as const;
