import type { NextFunction, Request, Response } from 'express';

export interface AuthenticatedUserContext {
  id: string;
  email: string;
  role: 'STUDENT' | 'DRIVER' | 'ADMIN';
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthenticatedUserContext;
}

function getHeaderAsString(value: string | string[] | undefined): string | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

export function requireGatewayAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const userId = getHeaderAsString(req.headers['x-user-id']);
  const userEmail = getHeaderAsString(req.headers['x-user-email']);
  const userRole = getHeaderAsString(req.headers['x-user-role']);

  if (!userId || !userEmail || !userRole) {
    return res.status(401).json({
      error: 'Usuario no autenticado.',
      code: 'AUTH_CONTEXT_REQUIRED',
    });
  }

  if (!['STUDENT', 'DRIVER', 'ADMIN'].includes(userRole)) {
    return res.status(403).json({
      error: 'Rol inválido.',
      code: 'INVALID_ROLE',
    });
  }

  req.authUser = {
    id: userId,
    email: userEmail,
    role: userRole as 'STUDENT' | 'DRIVER' | 'ADMIN',
  };

  return next();
}