import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, requireAdmin } from '../lib/auth.js';
import { runAllocation, previewAllocation } from '../lib/allocate.js';

export const counsellingRouter = Router();
const MAX_PREFERENCES = 8;

const replacePreferences = db.transaction((studentId, choices) => {
  db.prepare('DELETE FROM preferences WHERE student_id = ?').run(studentId);
  const insert = db.prepare('INSERT INTO preferences (student_id, rank, hostel_code, room_type) VALUES (?, ?, ?, ?)');
  choices.forEach((choice, index) => insert.run(studentId, index + 1, choice.hostelCode, choice.roomType));
});

counsellingRouter.post('/preferences', requireAuth, (req, res) => {
  const alreadyAllocated = db.prepare("SELECT 1 FROM allocations WHERE student_id = ? AND status = 'allocated'").get(req.student.id);
  if (alreadyAllocated) return res.status(409).json({ error: 'You have already been allocated a room; preferences are locked' });

  const choices = Array.isArray(req.body?.choices) ? req.body.choices : null;
  if (!choices || choices.length === 0 || choices.length > MAX_PREFERENCES) {
    return res.status(400).json({ error: `Provide between 1 and ${MAX_PREFERENCES} ranked choices` });
  }
  for (const choice of choices) {
    if (!choice?.hostelCode || !choice?.roomType) return res.status(400).json({ error: 'Each choice needs hostelCode and roomType' });
    const hostel = db.prepare('SELECT gender, room_types FROM hostels WHERE code = ?').get(choice.hostelCode);
    if (!hostel) return res.status(400).json({ error: `Unknown hostel block: ${choice.hostelCode}` });
    if (hostel.gender !== req.student.gender) return res.status(400).json({ error: `${choice.hostelCode} is not available for your gender category` });
    if (!JSON.parse(hostel.room_types).includes(String(choice.roomType))) {
      return res.status(400).json({ error: `${choice.hostelCode} does not offer room type ${choice.roomType}` });
    }
  }
  const codes = new Set(choices.map((choice) => `${choice.hostelCode}:${choice.roomType}`));
  if (codes.size !== choices.length) return res.status(400).json({ error: 'Duplicate choices are not allowed' });

  replacePreferences(req.student.id, choices);
  res.status(201).json({ ok: true, choices });
});

counsellingRouter.get('/preferences', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT hostel_code AS hostelCode, room_type AS roomType, rank FROM preferences WHERE student_id = ? ORDER BY rank ASC').all(req.student.id);
  res.json({ choices: rows });
});

counsellingRouter.get('/allocation/me', requireAuth, (req, res) => {
  const row = db.prepare(`SELECT a.hostel_code AS hostelCode, a.room_type AS roomType, a.status, a.allocated_at AS allocatedAt, h.name AS hostelName
    FROM allocations a LEFT JOIN hostels h ON h.code = a.hostel_code WHERE a.student_id = ?`).get(req.student.id);
  if (!row) return res.json({ status: 'not_processed' });
  res.json(row);
});

counsellingRouter.get('/allocation/preview', requireAuth, (req, res) => {
  res.json(previewAllocation(req.student.id));
});

counsellingRouter.post('/admin/run-allocation', requireAdmin, (req, res) => {
  res.json(runAllocation());
});

counsellingRouter.get('/admin/stats', requireAdmin, (req, res) => {
  const totals = db.prepare(`SELECT
    (SELECT COUNT(*) FROM students) AS totalStudents,
    (SELECT COUNT(*) FROM allocations WHERE status = 'allocated') AS allocated,
    (SELECT COUNT(*) FROM allocations WHERE status = 'waitlisted') AS waitlisted,
    (SELECT COUNT(*) FROM students s WHERE NOT EXISTS (SELECT 1 FROM preferences p WHERE p.student_id = s.id)) AS noPreferencesYet`).get();
  const perHostel = db.prepare(`SELECT hostel_code AS hostelCode, room_type AS roomType, used FROM seat_usage ORDER BY hostel_code, room_type`).all();
  res.json({ totals, seatUsage: perHostel });
});
