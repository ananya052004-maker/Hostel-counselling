import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { db } from '../db.js';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  const hash = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

export function createSession(studentId) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (token, student_id, expires_at) VALUES (?, ?, ?)').run(token, studentId, expiresAt);
  return token;
}

export function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  const session = db.prepare('SELECT student_id, expires_at FROM sessions WHERE token = ?').get(token);
  if (!session || new Date(session.expires_at) < new Date()) return res.status(401).json({ error: 'Session expired or invalid' });
  const student = db.prepare('SELECT id, reg_no, name, gender, cgpa, branch FROM students WHERE id = ?').get(session.student_id);
  if (!student) return res.status(401).json({ error: 'Account no longer exists' });
  req.student = student;
  next();
}

export function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return res.status(503).json({ error: 'Admin access is not configured on this server' });
  const provided = req.get('x-admin-key');
  if (!provided || provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return res.status(403).json({ error: 'Invalid admin key' });
  }
  next();
}
