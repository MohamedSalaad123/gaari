import mongoose from 'mongoose';
import { AppError } from './security.ts';

export function requireNonEmptyString(value: unknown, fieldLabel: string, maxLen = 200): string {
  if (typeof value !== 'string') {
    throw new AppError(`${fieldLabel} is required.`, 400, 'VALIDATION_ERROR');
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AppError(`${fieldLabel} cannot be empty.`, 400, 'VALIDATION_ERROR');
  }
  if (trimmed.length > maxLen) {
    throw new AppError(`${fieldLabel} must be ${maxLen} characters or less.`, 400, 'VALIDATION_ERROR');
  }
  return trimmed;
}

export function optionalString(value: unknown, maxLen = 500): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new AppError('Invalid text field value.', 400, 'VALIDATION_ERROR');
  }
  return value.trim().slice(0, maxLen);
}

export function requireDateString(value: unknown, fieldLabel = 'Date'): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new AppError(`${fieldLabel} must be a valid YYYY-MM-DD date.`, 400, 'VALIDATION_ERROR');
  }
  const trimmed = value.trim();
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new AppError(`${fieldLabel} is not a valid calendar date.`, 400, 'VALIDATION_ERROR');
  }
  return trimmed;
}

export function requireObjectId(value: unknown, fieldLabel = 'ID'): mongoose.Types.ObjectId {
  if (typeof value !== 'string' || !mongoose.Types.ObjectId.isValid(value.trim())) {
    throw new AppError(`Invalid ${fieldLabel}.`, 400, 'VALIDATION_ERROR');
  }
  return new mongoose.Types.ObjectId(value.trim());
}

export function requirePositiveInt(value: unknown, fieldLabel: string): number {
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isInteger(num) || num < 1) {
    throw new AppError(`${fieldLabel} must be a whole number of at least 1.`, 400, 'VALIDATION_ERROR');
  }
  return num;
}

export function requireNonNegativeNumber(value: unknown, fieldLabel: string): number {
  const num = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num) || num < 0) {
    throw new AppError(`${fieldLabel} must be a valid non-negative amount.`, 400, 'VALIDATION_ERROR');
  }
  return Math.round(num * 100) / 100;
}

export function requirePositiveNumber(value: unknown, fieldLabel: string): number {
  const num = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num) || num <= 0) {
    throw new AppError(`${fieldLabel} must be greater than zero.`, 400, 'VALIDATION_ERROR');
  }
  return Math.round(num * 100) / 100;
}

export function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldLabel: string
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new AppError(
      `${fieldLabel} must be one of: ${allowed.join(', ')}.`,
      400,
      'VALIDATION_ERROR'
    );
  }
  return value as T;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
