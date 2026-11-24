import crypto from 'node:crypto';

export const TYPES = ['bug', 'feature', 'fix'];
export const STATES = ['new', 'ready_for_implementation', 'in_progress', 'ready_for_acceptance', 'done'];

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const fail = (status, message, code) => {
  throw new HttpError(status, message, code);
};

// Wrap async route handlers so thrown errors reach the error middleware
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const randomToken = () => crypto.randomBytes(32).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Parses a positive integer id from a route param or body field; 404/400 on garbage
export function parseId(value, what = 'id', status = 400) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) fail(status, `Invalid ${what}`, 'VALIDATION_ERROR');
  return n;
}

export function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail(400, `${field} must not be empty`, 'VALIDATION_ERROR');
  return value;
}

export function requireEnum(value, allowed, field) {
  if (!allowed.includes(value)) fail(400, `${field} must be one of: ${allowed.join(', ')}`, 'VALIDATION_ERROR');
  return value;
}
