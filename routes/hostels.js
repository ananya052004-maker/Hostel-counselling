import { Router } from 'express';
import { db } from '../db.js';
import { remainingSeats } from '../lib/allocate.js';

export const hostelsRouter = Router();

function parseHostel(row) {
  return { ...row, roomTypes: JSON.parse(row.room_types), tags: JSON.parse(row.tags), roomCounts: JSON.parse(row.room_counts) };
}

hostelsRouter.get('/hostels', (req, res) => {
  const { gender, type, bed, search } = req.query;
  const blockMatch = String(search || '').trim().match(/^(?:mh\s*)?([a-z])(?:\s+block)?$/i);
  const blockCode = blockMatch ? `MH ${blockMatch[1].toUpperCase()}` : null;
  const rows = db.prepare(`SELECT * FROM hostels
    WHERE (? IS NULL OR gender = ?)
    AND (? IS NULL OR type = ?)
    AND (? IS NULL OR instr(room_types, ?) > 0)
    AND (
      (? IS NOT NULL AND upper(code) = upper(?))
      OR
      (? IS NULL AND (? IS NULL OR lower(name || ' ' || code) LIKE lower('%' || ? || '%')))
    )
    ORDER BY gender, code`).all(
    gender && gender !== 'all' ? gender : null, gender && gender !== 'all' ? gender : null,
    type && type !== 'all' ? type : null, type && type !== 'all' ? type : null,
    bed && bed !== 'all' ? `"${bed}"` : null, bed && bed !== 'all' ? `"${bed}"` : null,
    blockCode, blockCode, blockCode, search || null, search || null
  );
  res.json(rows.map(parseHostel));
});

hostelsRouter.get('/hostels/:code', (req, res) => {
  const row = db.prepare('SELECT * FROM hostels WHERE code = ?').get(req.params.code);
  if (!row) return res.status(404).json({ error: 'Hostel block not found' });
  res.json(parseHostel(row));
});

hostelsRouter.get('/hostels/:code/availability', (req, res) => {
  const row = db.prepare('SELECT * FROM hostels WHERE code = ?').get(req.params.code);
  if (!row) return res.status(404).json({ error: 'Hostel block not found' });
  const roomTypes = JSON.parse(row.room_types);
  const availability = Object.fromEntries(roomTypes.map((type) => [type, remainingSeats(row.code, type)]));
  res.json({ code: row.code, availability });
});
