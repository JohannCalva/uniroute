import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

interface JwtUserPayload {
  sub: string;
  id: string;
  email: string;
  role: 'STUDENT' | 'DRIVER' | 'ADMIN';
  iat?: number;
  exp?: number;
}

function getJwtSecret(): string {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  return jwtSecret;
}

function isPublicRoute(req: Request): boolean {
  const method = req.method.toUpperCase();
  const path = req.originalUrl.split('?')[0];

  const publicRoutes = [
    {
      method: 'POST',
      path: '/api/v1/usuarios/registro',
    },
    {
      method: 'POST',
      path: '/api/v1/usuarios/login',
    },
  ];

  return publicRoutes.some(
    (route) => route.method === method && route.path === path,
  );
}

function extractBearerToken(req: Request): string | null {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

function isJwtUserPayload(payload: string | jwt.JwtPayload): payload is JwtUserPayload {
  if (typeof payload === 'string') {
    return false;
  }

  return (
    typeof payload.id === 'string' &&
    typeof payload.email === 'string' &&
    typeof payload.role === 'string' &&
    ['STUDENT', 'DRIVER', 'ADMIN'].includes(payload.role)
  );
}

export function authenticateJwt(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (req.method.toUpperCase() === 'OPTIONS') {
      return next();
    }

    if (isPublicRoute(req)) {
      return next();
    }

    const token = extractBearerToken(req);

    if (!token) {
      return res.status(401).json({
        error: 'Token requerido.',
        code: 'AUTH_REQUIRED',
      });
    }

    const decoded = jwt.verify(token, getJwtSecret());

    if (!isJwtUserPayload(decoded)) {
      return res.status(401).json({
        error: 'Token inválido.',
        code: 'INVALID_TOKEN',
      });
    }

    /**
     * El Gateway agrega estos headers internos para que los servicios
     * puedan identificar al usuario autenticado sin volver a validar el JWT.
     */
    req.headers['x-user-id'] = decoded.id;
    req.headers['x-user-email'] = decoded.email;
    req.headers['x-user-role'] = decoded.role;

    return next();
  } catch (error) {
    console.error('[api-gateway] auth error:', error);

    return res.status(401).json({
      error: 'Token inválido o expirado.',
      code: 'INVALID_TOKEN',
    });
  }
}