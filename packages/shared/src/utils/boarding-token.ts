import jwt from 'jsonwebtoken';
import type { BoardingTokenPayload } from '../types/user';

export function generateBoardingToken(
  studentId: string,
  studentName: string,
  secret: string,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: BoardingTokenPayload = {
    studentId,
    studentName,
    issuedAt: now,
    expiresAt: now + 86400,
  };
  return jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '24h' });
}

export function verifyBoardingToken(
  token: string,
  secret: string,
): BoardingTokenPayload | null {
  try {
    const payload = jwt.verify(token, secret) as BoardingTokenPayload;
    return payload;
  } catch {
    return null;
  }
}
