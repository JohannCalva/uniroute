import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { generateBoardingToken } from '@uniroute/shared';

import {
  loginUserSchema,
  registerUserSchema,
  updateUserSchema,
} from '../schemas';

import {
  createUser,
  deleteUser,
  emailAlreadyExists,
  findAllUsers,
  findUserByEmail,
  findUserById,
  updateUser,
} from '../repositories/users.repository';

import {
  requireGatewayAuth,
  type AuthenticatedRequest,
} from '../middleware/auth-context';

export const usuariosRouter = Router();

const JWT_EXPIRES_IN_SECONDS = 24 * 60 * 60;

function getJwtSecret(): string {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  return jwtSecret;
}

function getQrHmacSecret(): string {
  const qrHmacSecret = process.env.QR_HMAC_SECRET;

  if (!qrHmacSecret) {
    throw new Error('QR_HMAC_SECRET environment variable is required');
  }

  return qrHmacSecret;
}

usuariosRouter.post('/registro', async (req, res) => {
  try {
    const parsedBody = registerUserSchema.safeParse(req.body);

    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'Validación fallida.',
        code: 'VALIDATION_ERROR',
        details: parsedBody.error.flatten().fieldErrors,
      });
    }

    const { email, password, nombre, rol } = parsedBody.data;

    const exists = await emailAlreadyExists(email);

    if (exists) {
      return res.status(409).json({
        error: 'El email ya está registrado.',
        code: 'EMAIL_ALREADY_EXISTS',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await createUser({
      email,
      passwordHash,
      nombre,
      rol,
    });

    return res.status(201).json(user);
  } catch (error) {
    console.error('[usuarios-service] register error:', error);

    return res.status(500).json({
      error: 'Error interno al registrar usuario.',
      code: 'REGISTER_INTERNAL_ERROR',
    });
  }
});

usuariosRouter.post('/login', async (req, res) => {
  try {
    const parsedBody = loginUserSchema.safeParse(req.body);

    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'Validación fallida.',
        code: 'VALIDATION_ERROR',
        details: parsedBody.error.flatten().fieldErrors,
      });
    }

    const { email, password } = parsedBody.data;

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(401).json({
        error: 'Credenciales incorrectas.',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      return res.status(401).json({
        error: 'Credenciales incorrectas.',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const token = jwt.sign(
      {
        sub: user.id,
        id: user.id,
        email: user.email,
        role: user.rol,
      },
      getJwtSecret(),
      {
        expiresIn: JWT_EXPIRES_IN_SECONDS,
      },
    );

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
      },
      expiresIn: JWT_EXPIRES_IN_SECONDS,
    });
  } catch (error) {
    console.error('[usuarios-service] login error:', error);

    return res.status(500).json({
      error: 'Error interno al iniciar sesión.',
      code: 'LOGIN_INTERNAL_ERROR',
    });
  }
});

usuariosRouter.get('/me', requireGatewayAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authUser = req.authUser;

    if (!authUser) {
      return res.status(401).json({
        error: 'Usuario no autenticado.',
        code: 'AUTH_CONTEXT_REQUIRED',
      });
    }

    const user = await findUserById(authUser.id);

    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado.',
        code: 'USER_NOT_FOUND',
      });
    }

    return res.status(200).json({
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error('[usuarios-service] me error:', error);

    return res.status(500).json({
      error: 'Error interno al obtener el perfil.',
      code: 'PROFILE_INTERNAL_ERROR',
    });
  }
});

usuariosRouter.get(
  '/me/boarding-token',
  requireGatewayAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const authUser = req.authUser;

      if (!authUser) {
        return res.status(401).json({
          error: 'Usuario no autenticado.',
          code: 'AUTH_CONTEXT_REQUIRED',
        });
      }

      if (authUser.role !== 'STUDENT') {
        return res.status(403).json({
          error: 'Solo los estudiantes pueden generar token de abordaje.',
          code: 'BOARDING_TOKEN_FORBIDDEN',
        });
      }

      const user = await findUserById(authUser.id);

      if (!user) {
        return res.status(404).json({
          error: 'Usuario no encontrado.',
          code: 'USER_NOT_FOUND',
        });
      }

      if (user.rol !== 'STUDENT') {
        return res.status(403).json({
          error: 'Solo los estudiantes pueden generar token de abordaje.',
          code: 'BOARDING_TOKEN_FORBIDDEN',
        });
      }

      const boardingToken = generateBoardingToken(
        user.id,
        user.nombre,
        getQrHmacSecret(),
      );

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      return res.status(200).json({
        boardingToken,
        expiresAt,
      });
    } catch (error) {
      console.error('[usuarios-service] boarding token error:', error);

      return res.status(500).json({
        error: 'Error interno al generar token de abordaje.',
        code: 'BOARDING_TOKEN_INTERNAL_ERROR',
      });
    }
  },
);

/**
 * Gestión de usuarios (solo ADMIN).
 * El gateway ya restringe estas rutas a ADMIN vía RBAC; aquí se re-verifica
 * el rol del header como defensa en profundidad (igual que /me/boarding-token).
 */
function requireAdmin(req: AuthenticatedRequest, res: import('express').Response): boolean {
  if (!req.authUser) {
    res.status(401).json({ error: 'Usuario no autenticado.', code: 'AUTH_CONTEXT_REQUIRED' });
    return false;
  }
  if (req.authUser.role !== 'ADMIN') {
    res.status(403).json({ error: 'Se requiere rol ADMIN.', code: 'ADMIN_REQUIRED' });
    return false;
  }
  return true;
}

usuariosRouter.get('/', requireGatewayAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const users = await findAllUsers();
    return res.status(200).json({ data: users, total: users.length });
  } catch (error) {
    console.error('[usuarios-service] list users error:', error);
    return res.status(500).json({
      error: 'Error interno al listar usuarios.',
      code: 'LIST_USERS_INTERNAL_ERROR',
    });
  }
});

usuariosRouter.put('/:id', requireGatewayAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const parsedBody = updateUserSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'Validación fallida.',
        code: 'VALIDATION_ERROR',
        details: parsedBody.error.flatten().fieldErrors,
      });
    }

    const updated = await updateUser(req.params.id, parsedBody.data);
    if (!updated) {
      return res.status(404).json({ error: 'Usuario no encontrado.', code: 'USER_NOT_FOUND' });
    }

    return res.status(200).json(updated);
  } catch (error: any) {
    // 22P02 = uuid inválido en el path param
    if (error?.code === '22P02') {
      return res.status(400).json({ error: 'ID de usuario inválido.', code: 'INVALID_ID' });
    }
    console.error('[usuarios-service] update user error:', error);
    return res.status(500).json({
      error: 'Error interno al actualizar usuario.',
      code: 'UPDATE_USER_INTERNAL_ERROR',
    });
  }
});

usuariosRouter.delete('/:id', requireGatewayAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    // Un admin no puede eliminarse a sí mismo (evita quedarse sin acceso).
    if (req.authUser && req.params.id === req.authUser.id) {
      return res.status(409).json({
        error: 'No puedes eliminar tu propia cuenta.',
        code: 'CANNOT_DELETE_SELF',
      });
    }

    const deleted = await deleteUser(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Usuario no encontrado.', code: 'USER_NOT_FOUND' });
    }

    return res.status(200).json({ message: 'Usuario eliminado.' });
  } catch (error: any) {
    // 23503 = foreign key violation: el usuario tiene viajes/abordajes asociados
    if (error?.code === '23503') {
      return res.status(409).json({
        error: 'No se puede eliminar: el usuario tiene viajes o abordajes registrados.',
        code: 'USER_HAS_REFERENCES',
      });
    }
    // 22P02 = uuid inválido
    if (error?.code === '22P02') {
      return res.status(400).json({ error: 'ID de usuario inválido.', code: 'INVALID_ID' });
    }
    console.error('[usuarios-service] delete user error:', error);
    return res.status(500).json({
      error: 'Error interno al eliminar usuario.',
      code: 'DELETE_USER_INTERNAL_ERROR',
    });
  }
});