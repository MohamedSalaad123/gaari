import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  connectToDatabase,
  getDbStatus,
  getMongoUri,
  isDbConnected,
  LoginAttemptModel,
  UserModel,
} from './db.ts';

export const AUTH_COOKIE_NAME = 'haulledger_token';
const JWT_EXPIRES_IN = '7d';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

export interface AuthenticatedUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  tokenVersion: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

interface JwtPayloadShape {
  sub: string;
  username: string;
  role: string;
  tv: number;
}

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

let cachedFallbackSecret: string | null = null;

function getJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET?.trim();
  if (envSecret) return envSecret;

  if (!cachedFallbackSecret) {
    const seed = getMongoUri() || process.cwd();
    cachedFallbackSecret = crypto
      .createHmac('sha256', 'haulledger-jwt-fallback-key')
      .update(seed)
      .digest('hex');
  }
  return cachedFallbackSecret;
}

/**
 * Easy-to-create and easy-to-remember password policy:
 * - Minimum 8 characters
 * - Allows uppercase, lowercase, and numbers without forcing complicated symbols
 */
export function validatePasswordStrength(password: string): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (password.length > 128) {
    return 'Password must be 128 characters or less.';
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAuthToken(user: AuthenticatedUser): string {
  const payload: JwtPayloadShape = {
    sub: user.id,
    username: user.username,
    role: user.role,
    tv: user.tokenVersion,
  };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

export function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }

  return null;
}

export async function verifyTokenAndLoadUser(token: string): Promise<AuthenticatedUser | null> {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayloadShape;
    if (!decoded?.sub) return null;

    const user = await UserModel.findById(decoded.sub)
      .select('username fullName role tokenVersion')
      .lean();

    if (!user) return null;
    if ((user.tokenVersion ?? 1) !== (decoded.tv ?? 1)) return null;

    return {
      id: user._id.toString(),
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 1,
    };
  } catch {
    return null;
  }
}

export function setAuthCookie(res: Response, token: string): void {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response): void {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    path: '/',
  });
}

export async function ensureDbReady(): Promise<void> {
  if (isDbConnected()) return;
  const connected = await connectToDatabase();
  if (!connected) {
    const status = getDbStatus();
    throw new AppError(
      status.error || 'MongoDB database is not connected. Please configure MONGODB_URI.',
      503,
      status.configured ? 'DB_CONNECTION_ERROR' : 'DB_NOT_CONFIGURED'
    );
  }
}

export function getClientAttemptKey(req: Request, username: string): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : null) ||
    req.ip ||
    req.socket.remoteAddress ||
    'unknown';
  return `${ip}::${username.trim().toLowerCase()}`;
}

export async function checkLoginRateLimit(
  attemptKey: string
): Promise<{ blocked: boolean; remainingSeconds: number }> {
  const row = await LoginAttemptModel.findOne({ attemptKey }).lean();
  if (!row || !row.lockedUntil) {
    return { blocked: false, remainingSeconds: 0 };
  }

  const lockedUntilMs = new Date(row.lockedUntil).getTime();
  const nowMs = Date.now();
  if (lockedUntilMs > nowMs) {
    return {
      blocked: true,
      remainingSeconds: Math.ceil((lockedUntilMs - nowMs) / 1000),
    };
  }

  await LoginAttemptModel.deleteOne({ attemptKey });
  return { blocked: false, remainingSeconds: 0 };
}

export async function recordFailedLoginAttempt(attemptKey: string): Promise<{
  attempts: number;
  locked: boolean;
  remainingAttempts: number;
}> {
  const existing = await LoginAttemptModel.findOne({ attemptKey });
  const newAttempts = (existing?.attempts ?? 0) + 1;
  const locked = newAttempts >= MAX_LOGIN_ATTEMPTS;
  const lockedUntil = locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;

  await LoginAttemptModel.updateOne(
    { attemptKey },
    {
      $set: {
        attempts: newAttempts,
        lockedUntil,
        lastAttemptAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    },
    { upsert: true }
  );

  return {
    attempts: newAttempts,
    locked,
    remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - newAttempts),
  };
}

export async function clearFailedLoginAttempts(attemptKey: string): Promise<void> {
  await LoginAttemptModel.deleteOne({ attemptKey });
}

export async function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractTokenFromRequest(req);
    if (!token) {
      next(new AppError('Authentication required. Please sign in.', 401, 'UNAUTHORIZED'));
      return;
    }

    await ensureDbReady();

    const user = await verifyTokenAndLoadUser(token);
    if (!user) {
      next(
        new AppError(
          'Your session has expired or is invalid. Please sign in again.',
          401,
          'SESSION_EXPIRED'
        )
      );
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  const anyErr = err as { name?: string; code?: number; message?: string };

  if (anyErr?.name === 'ValidationError') {
    res.status(400).json({
      error: anyErr.message || 'Validation failed.',
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  if (anyErr?.name === 'CastError') {
    res.status(400).json({
      error: 'Invalid record identifier.',
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  if (anyErr?.code === 11000) {
    res.status(409).json({
      error: 'A record with this unique identifier already exists.',
      code: 'DUPLICATE_RECORD',
    });
    return;
  }

  console.error('[Server Error]', err);
  res.status(500).json({
    error: 'Internal server error. Please try again.',
    code: 'INTERNAL_ERROR',
  });
}
