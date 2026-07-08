-- UniRoute — Initial Schema
-- PostgreSQL 16

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id            UUID DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  nombre        VARCHAR(100) NOT NULL,
  rol           VARCHAR(20) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT pk_usuarios PRIMARY KEY (id),
  CONSTRAINT uq_usuarios_email UNIQUE (email),
  CONSTRAINT chk_usuarios_rol CHECK (rol IN ('STUDENT','DRIVER','ADMIN'))
);

CREATE TABLE IF NOT EXISTS rutas (
  id              UUID DEFAULT gen_random_uuid(),
  nombre          VARCHAR(100) NOT NULL,
  origen          VARCHAR(100) NOT NULL,
  destino         VARCHAR(100) NOT NULL,
  precio          DECIMAL(10,2) DEFAULT 0.00,
  activa          BOOLEAN DEFAULT TRUE,
  horario_inicio  TIME,
  horario_fin     TIME,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT pk_rutas PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS paradas (
  id         UUID DEFAULT gen_random_uuid(),
  ruta_id    UUID NOT NULL,
  nombre     VARCHAR(100) NOT NULL,
  latitud    DECIMAL(10,7) NOT NULL,
  longitud   DECIMAL(10,7) NOT NULL,
  orden      INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT pk_paradas PRIMARY KEY (id),
  CONSTRAINT fk_paradas_ruta_id FOREIGN KEY (ruta_id) REFERENCES rutas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS buses (
  id                UUID DEFAULT gen_random_uuid(),
  placa             VARCHAR(20) NOT NULL,
  capacidad_maxima  INTEGER NOT NULL,
  ruta_asignada_id  UUID,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT pk_buses PRIMARY KEY (id),
  CONSTRAINT uq_buses_placa UNIQUE (placa),
  CONSTRAINT fk_buses_ruta_asignada_id FOREIGN KEY (ruta_asignada_id) REFERENCES rutas(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS viajes (
  id               UUID DEFAULT gen_random_uuid(),
  bus_id           UUID NOT NULL,
  ruta_id          UUID NOT NULL,
  conductor_id     UUID NOT NULL,
  inicio_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fin_at           TIMESTAMPTZ,
  pasajeros_total  INTEGER DEFAULT 0,
  estado           VARCHAR(20) NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT pk_viajes PRIMARY KEY (id),
  CONSTRAINT fk_viajes_bus_id FOREIGN KEY (bus_id) REFERENCES buses(id),
  CONSTRAINT fk_viajes_ruta_id FOREIGN KEY (ruta_id) REFERENCES rutas(id),
  CONSTRAINT fk_viajes_conductor_id FOREIGN KEY (conductor_id) REFERENCES usuarios(id),
  CONSTRAINT chk_viajes_estado CHECK (estado IN ('ACTIVE','COMPLETED','CANCELLED'))
);

CREATE TABLE IF NOT EXISTS abordajes (
  id            UUID DEFAULT gen_random_uuid(),
  viaje_id      UUID NOT NULL,
  estudiante_id UUID NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT pk_abordajes PRIMARY KEY (id),
  CONSTRAINT fk_abordajes_viaje_id FOREIGN KEY (viaje_id) REFERENCES viajes(id) ON DELETE CASCADE,
  CONSTRAINT fk_abordajes_estudiante_id FOREIGN KEY (estudiante_id) REFERENCES usuarios(id),
  CONSTRAINT uq_abordajes_viaje_estudiante UNIQUE (viaje_id, estudiante_id)
);

CREATE TABLE IF NOT EXISTS eventos_bus (
  id            UUID DEFAULT gen_random_uuid(),
  bus_id        UUID NOT NULL,
  viaje_id      UUID,
  tipo          VARCHAR(30) NOT NULL,
  payload       JSONB NOT NULL,
  lamport_clock INTEGER NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT pk_eventos_bus PRIMARY KEY (id),
  CONSTRAINT fk_eventos_bus_bus_id FOREIGN KEY (bus_id) REFERENCES buses(id),
  CONSTRAINT fk_eventos_bus_viaje_id FOREIGN KEY (viaje_id) REFERENCES viajes(id)
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_eventos_bus_bus_created
  ON eventos_bus(bus_id, created_at);

CREATE INDEX IF NOT EXISTS idx_viajes_bus_estado
  ON viajes(bus_id, estado);

CREATE INDEX IF NOT EXISTS idx_viajes_conductor
  ON viajes(conductor_id);

CREATE INDEX IF NOT EXISTS idx_abordajes_viaje
  ON abordajes(viaje_id);

CREATE INDEX IF NOT EXISTS idx_paradas_ruta_orden
  ON paradas(ruta_id, orden);

-- ============================================================
-- SEED DATA
-- Dev passwords are all 'password123' (bcrypt 10 rounds)
-- ============================================================

INSERT INTO usuarios (id, email, password_hash, nombre, rol) VALUES
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'admin@udla.edu.ec',
   '$2b$10$XfJcJWWpN4UvNBQz5/G1Kuc2HBtUQiemwKdWDpmr9gLKSfeGH2Hzi',
   'Administrador UDLA', 'ADMIN'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d480', 'conductor.carlos@udla.edu.ec',
   '$2b$10$XfJcJWWpN4UvNBQz5/G1Kuc2HBtUQiemwKdWDpmr9gLKSfeGH2Hzi',
   'Carlos Mendoza', 'DRIVER'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d481', 'conductor.ana@udla.edu.ec',
   '$2b$10$XfJcJWWpN4UvNBQz5/G1Kuc2HBtUQiemwKdWDpmr9gLKSfeGH2Hzi',
   'Ana Torres', 'DRIVER'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d482', 'estudiante.sofia@udla.edu.ec',
   '$2b$10$XfJcJWWpN4UvNBQz5/G1Kuc2HBtUQiemwKdWDpmr9gLKSfeGH2Hzi',
   'Sofía Ramírez', 'STUDENT'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d483', 'estudiante.miguel@udla.edu.ec',
   '$2b$10$XfJcJWWpN4UvNBQz5/G1Kuc2HBtUQiemwKdWDpmr9gLKSfeGH2Hzi',
   'Miguel Andrade', 'STUDENT'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d484', 'estudiante.lucia@udla.edu.ec',
   '$2b$10$XfJcJWWpN4UvNBQz5/G1Kuc2HBtUQiemwKdWDpmr9gLKSfeGH2Hzi',
   'Lucía Vega', 'STUDENT'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d485', 'estudiante.juan@udla.edu.ec',
   '$2b$10$XfJcJWWpN4UvNBQz5/G1Kuc2HBtUQiemwKdWDpmr9gLKSfeGH2Hzi',
   'Juan Pacheco', 'STUDENT'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d486', 'estudiante.valeria@udla.edu.ec',
   '$2b$10$XfJcJWWpN4UvNBQz5/G1Kuc2HBtUQiemwKdWDpmr9gLKSfeGH2Hzi',
   'Valeria Mora', 'STUDENT')
ON CONFLICT (id) DO NOTHING;

INSERT INTO rutas (id, nombre, origen, destino, precio, activa, horario_inicio, horario_fin) VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01', 'Granados → UDLAPark',
   'Campus UDLA Granados', 'UDLAPark', 0.00, TRUE, '07:00', '20:00'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02', 'Granados → Colón',
   'Campus UDLA Granados', 'Av. Colón', 0.00, TRUE, '07:00', '20:00'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03', 'Colón → Norte',
   'Av. Colón', 'Condado Shopping', 0.00, TRUE, '07:00', '20:00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO paradas (id, ruta_id, nombre, latitud, longitud, orden) VALUES
  -- Ruta 1: Granados → UDLAPark
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
   'Campus UDLA Granados', -0.1666700, -78.4877800, 1),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c12', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
   'Av. Brasil y Granados', -0.1690000, -78.4870000, 2),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c13', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
   'Estadio LDU (referencia)', -0.1710000, -78.4860000, 3),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c14', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
   'Av. Interoceánica', -0.1735000, -78.4852000, 4),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c15', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
   'UDLAPark Entrada', -0.1760000, -78.4845000, 5),
  -- Ruta 2: Granados → Colón
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c21', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
   'Campus UDLA Granados', -0.1666700, -78.4877800, 1),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c22', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
   'Av. 10 de Agosto y Brasil', -0.1780000, -78.4920000, 2),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c23', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
   'Hospital Metropolitano', -0.1860000, -78.4890000, 3),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c24', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
   'La Pradera', -0.1990000, -78.4897000, 4),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c25', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
   '12 de Octubre y Orellana', -0.2045000, -78.4896000, 5),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c26', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
   'Av. Colón y Reina Victoria', -0.2067000, -78.4886000, 6),
  -- Ruta 3: Colón → Norte
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c31', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
   'Av. Colón y Reina Victoria', -0.2067000, -78.4886000, 1),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c32', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
   'Av. Shyris y República', -0.1900000, -78.4850000, 2),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c33', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
   'Parque El Ejido', -0.1850000, -78.4940000, 3),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c34', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
   'Shyris y Naciones Unidas', -0.1550000, -78.4880000, 4),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c35', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
   'Quicentro Norte Mall', -0.1280000, -78.4920000, 5),
  ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c36', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
   'Condado Shopping', -0.1160000, -78.4970000, 6)
ON CONFLICT (id) DO NOTHING;

INSERT INTO buses (id, placa, capacidad_maxima, ruta_asignada_id) VALUES
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b01', 'PBB-0123', 40,
   'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b02', 'GHT-4567', 35,
   'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b03', 'MNK-8901', 40,
   'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b04', 'TXR-2345', 45,
   'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b05', 'WQP-6789', 38, NULL)
ON CONFLICT (id) DO NOTHING;
