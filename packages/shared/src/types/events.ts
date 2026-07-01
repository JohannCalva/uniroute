import type { BusStatus } from './bus';

export type BusEventType = 'STATUS_CHANGE' | 'GPS_UPDATE' | 'AFORO_UPDATE' | 'PROXIMITY_UPDATE';

export interface BusEvent {
  eventId: string;
  type: BusEventType;
  busId: string;
  routeId: string;
  tripId: string;
  lamportClock: number;
  timestamp: string;
  payload: StatusChangePayload | GpsUpdatePayload | AforoUpdatePayload | ProximityUpdatePayload;
}

export interface StatusChangePayload {
  previousStatus: BusStatus | null;
  newStatus: BusStatus;
  triggeredBy: 'DRIVER';
}

export interface GpsUpdatePayload {
  latitude: number;
  longitude: number;
}

export interface AforoUpdatePayload {
  aforoActual: number;
  capacidadMaxima: number;
  porcentaje: number;
  trigger: 'QR_SCAN' | 'DRIVER_OVERRIDE' | 'TRIP_RESET';
  studentName?: string;
}

export interface ProximityStudent {
  etaSeconds: number;
  distanceMeters: number;
}

export interface ProximityUpdatePayload {
  totalStudentsWaiting: number;
  maxEtaSeconds: number;
  nearestStopName: string;
  students: ProximityStudent[];
}
