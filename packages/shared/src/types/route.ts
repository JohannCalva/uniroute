export interface Stop {
  id: string;
  rutaId: string;
  nombre: string;
  latitud: number;
  longitud: number;
  orden: number;
}

export interface Route {
  id: string;
  nombre: string;
  origen: string;
  destino: string;
  precio: number;
  activa: boolean;
  horarioInicio: string;
  horarioFin: string;
  paradas: Stop[];
}

export interface CreateRouteRequest {
  nombre: string;
  origen: string;
  destino: string;
  precio: number;
  horarioInicio: string;
  horarioFin: string;
}

export interface CreateStopRequest {
  nombre: string;
  latitud: number;
  longitud: number;
  orden: number;
}
