export interface Bus {
  id: string;
  placa: string;
  capacidadMaxima: number;
  rutaAsignada: { id: string; nombre: string } | null;
  estadoEnVivo: BusLiveStatus | null;
}

export interface BusLiveStatus {
  status: BusStatus;
  lat: number;
  lng: number;
  aforoActual: number;
  lamportClock: number;
  lastUpdate: string;
}

export type BusStatus = 'AT_STOP' | 'DEPARTING' | 'EN_ROUTE' | 'FULL' | 'ARRIVED';

export interface CreateBusRequest {
  placa: string;
  capacidadMaxima: number;
}

export interface AssignBusRequest {
  rutaId: string;
}
