import { z } from 'zod';

const userRoles = ['STUDENT', 'DRIVER', 'ADMIN'] as const;

export const registerUserSchema = z.object({
  email: z
    .string()
    .email('El email debe tener un formato válido.')
    .transform((value) => value.toLowerCase().trim())
    .refine((value) => value.endsWith('@udla.edu.ec'), {
      message: 'El email debe pertenecer al dominio @udla.edu.ec.',
    }),

  password: z
    .string()
    .min(8, 'La contraseña debe tener mínimo 8 caracteres.'),

  nombre: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener mínimo 2 caracteres.')
    .max(120, 'El nombre no puede superar 120 caracteres.'),

  rol: z.enum(userRoles, {
    message: 'El rol debe ser STUDENT, DRIVER o ADMIN.',
  }),
});

export const loginUserSchema = z.object({
  email: z
    .string()
    .email('El email debe tener un formato válido.')
    .transform((value) => value.toLowerCase().trim()),

  password: z
    .string()
    .min(1, 'La contraseña es requerida.'),
});

export const updateUserSchema = z
  .object({
    nombre: z
      .string()
      .trim()
      .min(2, 'El nombre debe tener mínimo 2 caracteres.')
      .max(120, 'El nombre no puede superar 120 caracteres.')
      .optional(),

    rol: z
      .enum(userRoles, {
        message: 'El rol debe ser STUDENT, DRIVER o ADMIN.',
      })
      .optional(),
  })
  .refine((data) => data.nombre !== undefined || data.rol !== undefined, {
    message: 'Debes enviar al menos un campo a actualizar (nombre o rol).',
  });

export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type LoginUserInput = z.infer<typeof loginUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;