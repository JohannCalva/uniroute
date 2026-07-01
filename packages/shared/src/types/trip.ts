import type { BusStatus } from './bus';

export type TripStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface Trip {
  id: string;
  bus: { id: string; placa: string };
  ruta: { id: string; nombre: string };
  conductor: { id: string; nombre: string };
  inicioAt: string;
  finAt: string | null;
  pasajerosTotal: number;
  estado: TripStatus;
}

export interface StartTripRequest {
  busId: string;
  rutaId: string;
}

export interface StartTripResponse {
  viajeId: string;
  busId: string;
  rutaId: string;
  estado: TripStatus;
  inicioAt: string;
  lamportClock: number;
}

export interface StatusChangeRequest {
  busId: string;
  status: BusStatus;
  lamportClock: number;
}

export interface StatusChangeResponse {
  accepted: boolean;
  serverLamportClock: number;
  busId: string;
  status: BusStatus;
}

export interface GpsUpdateRequest {
  busId: string;
  latitude: number;
  longitude: number;
}

export interface BoardingRequest {
  busId: string;
  boardingToken: string;
}

export interface BoardingResponse {
  valid: boolean;
  studentId: string;
  studentName: string;
  aforoActual: number;
  capacidadMaxima: number;
}

export interface ProximityRequest {
  rutaId: string;
  latitude: number;
  longitude: number;
}

export interface ProximityResponse {
  received: boolean;
  etaSeconds: number;
  distanceMeters: number;
  nearestStop: { id: string; nombre: string };
}

export interface EndTripRequest {
  busId: string;
}

export interface EndTripResponse {
  viajeId: string;
  estado: TripStatus;
  pasajerosTotal: number;
  finAt: string;
}

export interface BusStatusResponse {
  busId: string;
  status: BusStatus;
  lat: number;
  lng: number;
  aforoActual: number;
  capacidadMaxima: number;
  lamportClock: number;
  lastUpdate: string;
  estudiantesEsperando: number;
  etaMaxEsperando: number;
}
