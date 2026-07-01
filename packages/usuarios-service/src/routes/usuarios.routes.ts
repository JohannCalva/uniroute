import { Router } from 'express';
import bcrypt from 'bcrypt';

import { registerUserSchema } from '../schemas';
import {
  createUser,
  emailAlreadyExists,
} from '../repositories/users.repository';

export const usuariosRouter = Router();

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