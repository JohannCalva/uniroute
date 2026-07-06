import type { NextFunction, Request, Response } from "express";

type UserRole = "STUDENT" | "DRIVER" | "ADMIN";

interface PermissionRule {
  method: string;
  pattern: RegExp;
  allowedRoles: UserRole[];
}

function getHeaderAsString(
  value: string | string[] | undefined,
): string | null {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function getRequestPath(req: Request): string {
  return req.originalUrl.split("?")[0];
}

function isPublicRoute(req: Request): boolean {
  const method = req.method.toUpperCase();
  const path = getRequestPath(req);

  return (
    (method === "POST" && path === "/api/v1/usuarios/registro") ||
    (method === "POST" && path === "/api/v1/usuarios/login")
  );
}

const permissionRules: PermissionRule[] = [
  /**
   * Usuarios
   */
  {
    method: "GET",
    pattern: /^\/api\/v1\/usuarios\/me$/,
    allowedRoles: ["STUDENT", "DRIVER", "ADMIN"],
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/usuarios\/me\/boarding-token$/,
    allowedRoles: ["STUDENT"],
  },

  /**
   * Rutas públicas para usuarios autenticados
   */
  {
    method: "GET",
    pattern: /^\/api\/v1\/rutas$/,
    allowedRoles: ["STUDENT", "DRIVER", "ADMIN"],
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/rutas\/[^/]+$/,
    allowedRoles: ["STUDENT", "DRIVER", "ADMIN"],
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/rutas\/[^/]+\/paradas$/,
    allowedRoles: ["STUDENT", "DRIVER", "ADMIN"],
  },

  /**
   * Administración de rutas, buses y paradas
   */
  {
    method: "POST",
    pattern: /^\/api\/v1\/rutas$/,
    allowedRoles: ["ADMIN"],
  },
  {
    method: "PUT",
    pattern: /^\/api\/v1\/rutas\/[^/]+$/,
    allowedRoles: ["ADMIN"],
  },
  {
    method: "DELETE",
    pattern: /^\/api\/v1\/rutas\/[^/]+$/,
    allowedRoles: ["ADMIN"],
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/rutas\/[^/]+\/paradas$/,
    allowedRoles: ["ADMIN"],
  },
  {
    method: "PUT",
    pattern: /^\/api\/v1\/paradas\/[^/]+$/,
    allowedRoles: ["ADMIN"],
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/buses$/,
    allowedRoles: ["ADMIN"],
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/buses\/[^/]+$/,
    allowedRoles: ["ADMIN"],
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/buses$/,
    allowedRoles: ["ADMIN"],
  },
  {
    method: "PUT",
    pattern: /^\/api\/v1\/buses\/[^/]+\/asignar$/,
    allowedRoles: ["ADMIN"],
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/viajes\/historial$/,
    allowedRoles: ["ADMIN"],
  },

  /**
   * Despachos - estudiante
   */
  {
    method: "POST",
    pattern: /^\/api\/v1\/despachos\/proximidad$/,
    allowedRoles: ["STUDENT"],
  },

  /**
   * Despachos - conductor
   */
  {
    method: "POST",
    pattern: /^\/api\/v1\/despachos\/estado$/,
    allowedRoles: ["DRIVER"],
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/despachos\/gps$/,
    allowedRoles: ["DRIVER"],
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/despachos\/abordaje$/,
    allowedRoles: ["DRIVER"],
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/despachos\/viaje\/iniciar$/,
    allowedRoles: ["DRIVER"],
  },
  {
    method: "POST",
    pattern: /^\/api\/v1\/despachos\/viaje\/finalizar$/,
    allowedRoles: ["DRIVER"],
  },
  {
    method: "GET",
    pattern: /^\/api\/v1\/despachos\/bus\/[^/]+\/estado$/,
    allowedRoles: ["STUDENT", "DRIVER", "ADMIN"],
  },
];

function findPermissionRule(req: Request): PermissionRule | null {
  const method = req.method.toUpperCase();
  const path = getRequestPath(req);

  return (
    permissionRules.find(
      (rule) => rule.method === method && rule.pattern.test(path),
    ) ?? null
  );
}

export function authorizeByRole(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.method.toUpperCase() === "OPTIONS") {
    return next();
  }

  if (isPublicRoute(req)) {
    return next();
  }

  const userRole = getHeaderAsString(
    req.headers["x-user-role"],
  ) as UserRole | null;

  if (!userRole || !["STUDENT", "DRIVER", "ADMIN"].includes(userRole)) {
    return res.status(403).json({
      error: "Rol no disponible o inválido.",
      code: "ROLE_REQUIRED",
    });
  }

  const rule = findPermissionRule(req);

  /**
   * Política segura:
   * Si la ruta no está registrada en RBAC, se bloquea.
   * Así evitamos abrir endpoints nuevos por accidente.
   */
  if (!rule) {
    return res.status(403).json({
      error: "No existe una regla de permisos para este endpoint.",
      code: "RBAC_RULE_NOT_FOUND",
    });
  }

  if (!rule.allowedRoles.includes(userRole)) {
    return res.status(403).json({
      error: "No tienes permisos para acceder a este recurso.",
      code: "FORBIDDEN",
    });
  }

  return next();
}
