import type { Bus } from '../types/bus';

export const MOCK_BUSES: Bus[] = [
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b01',
    placa: 'PBB-0123',
    capacidadMaxima: 40,
    rutaAsignada: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', nombre: 'Granados → UDLAPark' },
    estadoEnVivo: null,
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b02',
    placa: 'GHT-4567',
    capacidadMaxima: 35,
    rutaAsignada: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', nombre: 'Granados → UDLAPark' },
    estadoEnVivo: null,
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b03',
    placa: 'MNK-8901',
    capacidadMaxima: 40,
    rutaAsignada: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', nombre: 'Granados → Colón' },
    estadoEnVivo: null,
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b04',
    placa: 'TXR-2345',
    capacidadMaxima: 45,
    rutaAsignada: { id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', nombre: 'Colón → Norte' },
    estadoEnVivo: null,
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b05',
    placa: 'WQP-6789',
    capacidadMaxima: 38,
    rutaAsignada: null,
    estadoEnVivo: null,
  },
];
