export type UserRole = 'STUDENT' | 'DRIVER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  nombre: string;
  rol: UserRole;
  createdAt: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  nombre: string;
  rol: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
  expiresIn: number;
}

export interface BoardingTokenResponse {
  boardingToken: string;
  expiresAt: string;
}

export interface BoardingTokenPayload {
  studentId: string;
  studentName: string;
  issuedAt: number;
  expiresAt: number;
}
