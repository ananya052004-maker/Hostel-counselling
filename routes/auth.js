import { Router } from 'express';
import { db, branchStrengths, branchStrengthMap } from '../db.js';
import { createSession, requireAuth } from '../lib/auth.js';

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const publicStudent = (s) => ({ id: s.id, regNo: s.reg_no, email: s.email, name: s.name, gender: s.gender, cgpa: s.cgpa, branch: s.branch });

authRouter.get('/branches', (_req, res) => {
  res.json({
    branches: branchStrengths,
    disclaimer: 'Branch strengths are best-available estimates from third-party sources, not confirmed against an official VIT document. Used only to drive relative allocation priority.'
  });
});

// No password: an email that's already registered logs straight in.
// An unrecognized email tells the frontend to show the registration form.
authRouter.post('/auth/identify', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  const student = db.prepare('SELECT * FROM students WHERE email = ?').get(email);
  if (!student) return res.json({ found: false });
  const token = createSession(student.id);
  res.json({ found: true, token, student: publicStudent(student) });
});

authRouter.post('/auth/register', (req, res) => {
  const { regNo, name, gender, cgpa, branch } = req.body || {};
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (!regNo || !name) return res.status(400).json({ error: 'regNo and name are required' });
  if (gender !== 'mens' && gender !== 'ladies') return res.status(400).json({ error: "gender must be 'mens' or 'ladies'" });
  const cgpaNum = Number(cgpa);
  if (!Number.isFinite(cgpaNum) || cgpaNum < 0 || cgpaNum > 10) return res.status(400).json({ error: 'cgpa must be a number between 0 and 10' });
  if (!branchStrengthMap.has(branch)) return res.status(400).json({ error: 'branch must be one of the listed branch codes (see GET /api/branches)' });

  if (db.prepare('SELECT 1 FROM students WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'An account with this email already exists — log in instead' });
  }
  if (db.prepare('SELECT 1 FROM students WHERE reg_no = ?').get(regNo)) {
    return res.status(409).json({ error: 'An account with this registration number already exists' });
  }

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO students (reg_no, email, name, gender, cgpa, branch) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(regNo, email, name, gender, cgpaNum, branch);

  const token = createSession(lastInsertRowid);
  res.status(201).json({ token, student: { id: lastInsertRowid, regNo, email, name, gender, cgpa: cgpaNum, branch } });
});

authRouter.get('/auth/me', requireAuth, (req, res) => {
  res.json({ student: publicStudent(req.student) });
});
