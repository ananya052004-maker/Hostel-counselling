import { Router } from 'express';
import { db, branchStrengths, branchStrengthMap } from '../db.js';
import { hashPassword, verifyPassword, createSession, requireAuth } from '../lib/auth.js';

export const authRouter = Router();

authRouter.get('/branches', (_req, res) => {
  res.json({
    branches: branchStrengths,
    disclaimer: 'Branch strengths are best-available estimates from third-party sources, not confirmed against an official VIT document. Used only to drive relative allocation priority.'
  });
});

authRouter.post('/auth/register', (req, res) => {
  const { regNo, name, gender, cgpa, branch, password } = req.body || {};
  if (!regNo || !name || !password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'regNo, name, and a password of at least 6 characters are required' });
  }
  if (gender !== 'mens' && gender !== 'ladies') return res.status(400).json({ error: "gender must be 'mens' or 'ladies'" });
  const cgpaNum = Number(cgpa);
  if (!Number.isFinite(cgpaNum) || cgpaNum < 0 || cgpaNum > 10) return res.status(400).json({ error: 'cgpa must be a number between 0 and 10' });
  if (!branchStrengthMap.has(branch)) return res.status(400).json({ error: 'branch must be one of the listed branch codes (see GET /api/branches)' });

  const existing = db.prepare('SELECT id FROM students WHERE reg_no = ?').get(regNo);
  if (existing) return res.status(409).json({ error: 'An account with this registration number already exists' });

  const { salt, hash } = hashPassword(password);
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO students (reg_no, name, gender, cgpa, branch, password_hash, password_salt) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(regNo, name, gender, cgpaNum, branch, hash, salt);

  const token = createSession(lastInsertRowid);
  res.status(201).json({ token, student: { id: lastInsertRowid, regNo, name, gender, cgpa: cgpaNum, branch } });
});

authRouter.post('/auth/login', (req, res) => {
  const { regNo, password } = req.body || {};
  if (!regNo || !password) return res.status(400).json({ error: 'regNo and password are required' });
  const student = db.prepare('SELECT * FROM students WHERE reg_no = ?').get(regNo);
  if (!student || !verifyPassword(password, student.password_salt, student.password_hash)) {
    return res.status(401).json({ error: 'Invalid registration number or password' });
  }
  const token = createSession(student.id);
  res.json({ token, student: { id: student.id, regNo: student.reg_no, name: student.name, gender: student.gender, cgpa: student.cgpa, branch: student.branch } });
});

authRouter.get('/auth/me', requireAuth, (req, res) => {
  res.json({ student: { id: req.student.id, regNo: req.student.reg_no, name: req.student.name, gender: req.student.gender, cgpa: req.student.cgpa, branch: req.student.branch } });
});
