import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import {
  loginUserSchema,
  registerUserSchema,
} from '../schemas';

import {
  createUser,
  emailAlreadyExists,
  findUserByEmail,
} from '../repositories/users.repository';

export const usuariosRouter = Router();

const JWT_EXPIRES_IN_SECONDS = 24 * 60 * 60;

function getJwtSecret(): string {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  return jwtSecret;
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