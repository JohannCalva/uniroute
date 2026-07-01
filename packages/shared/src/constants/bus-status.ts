export const BUS_STATUS = {
  AT_STOP: 'AT_STOP',
  DEPARTING: 'DEPARTING',
  EN_ROUTE: 'EN_ROUTE',
  FULL: 'FULL',
  ARRIVED: 'ARRIVED',
} as const;

export const BUS_STATUS_LABELS: Record<string, string> = {
  AT_STOP: 'En parada',
  DEPARTING: 'Saliendo en 5 min',
  EN_ROUTE: 'En ruta',
  FULL: 'Bus lleno',
  ARRIVED: 'Llegada',
};
