export const RABBITMQ_CONFIG = {
  EXCHANGE_NAME: 'bus.events',
  EXCHANGE_TYPE: 'topic',
  QUEUE_WS: 'ws.bus.events',
  BINDING_KEY_ALL: 'bus.#',
} as const;

export const ROUTING_KEYS = {
  statusChange: (busId: string) => `bus.${busId}.status_change`,
  gpsUpdate: (busId: string) => `bus.${busId}.gps_update`,
  aforoUpdate: (busId: string) => `bus.${busId}.aforo_update`,
  proximityUpdate: (busId: string) => `bus.${busId}.proximity_update`,
} as const;
