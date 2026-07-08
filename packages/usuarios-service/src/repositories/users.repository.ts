import type { User, UserRole } from '@uniroute/shared';

import { pool } from '../db';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  nombre: string;
  rol: UserRole;
  created_at: Date;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

export interface CreateUserData {
  email: string;
  passwordHash: string;
  nombre: string;
  rol: UserRole;
}

function mapUserRow(row: UserRow): UserWithPassword {
  return {
    id: row.id,
    email: row.email,
    nombre: row.nombre,
    rol: row.rol,
    createdAt: new Date(row.created_at).toISOString(),
    passwordHash: row.password_hash,
  };
}

export async function findUserByEmail(
  email: string,
): Promise<UserWithPassword | null> {
  const result = await pool.query<UserRow>(
    `
    SELECT id, email, password_hash, nombre, rol, created_at
    FROM usuarios
    WHERE LOWER(email) = LOWER($1)
    LIMIT 1
    `,
    [email],
  );

  const row = result.rows[0];
  return row ? mapUserRow(row) : null;
}

export async function findUserById(
  id: string,
): Promise<UserWithPassword | null> {
  const result = await pool.query<UserRow>(
    `
    SELECT id, email, password_hash, nombre, rol, created_at
    FROM usuarios
    WHERE id = $1
    LIMIT 1
    `,
    [id],
  );

  const row = result.rows[0];
  return row ? mapUserRow(row) : null;
}

export async function emailAlreadyExists(email: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `
    SELECT EXISTS(
      SELECT 1
      FROM usuarios
      WHERE LOWER(email) = LOWER($1)
    ) AS "exists"
    `,
    [email],
  );

  return result.rows[0]?.exists ?? false;
}

export async function createUser(data: CreateUserData): Promise<User> {
  const result = await pool.query<UserRow>(
    `
    INSERT INTO usuarios (email, password_hash, nombre, rol)
    VALUES ($1, $2, $3, $4)
    RETURNING id, email, password_hash, nombre, rol, created_at
    `,
    [data.email, data.passwordHash, data.nombre, data.rol],
  );

  const createdUser = mapUserRow(result.rows[0]);

  return {
    id: createdUser.id,
    email: createdUser.email,
    nombre: createdUser.nombre,
    rol: createdUser.rol,
    createdAt: createdUser.createdAt,
  };
}