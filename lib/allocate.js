import { db, ROOM_TYPE_KEYS } from '../db.js';

const hostelByCode = db.prepare('SELECT gender, room_counts FROM hostels WHERE code = ?');
const usedSeats = db.prepare('SELECT used FROM seat_usage WHERE hostel_code = ? AND room_type = ?');
const bumpUsedSeats = db.prepare(`INSERT INTO seat_usage (hostel_code, room_type, used) VALUES (?, ?, 1)
  ON CONFLICT(hostel_code, room_type) DO UPDATE SET used = used + 1`);
const upsertAllocation = db.prepare(`INSERT INTO allocations (student_id, hostel_code, room_type, status, allocated_at)
  VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT(student_id) DO UPDATE SET hostel_code = excluded.hostel_code, room_type = excluded.room_type,
    status = excluded.status, allocated_at = excluded.allocated_at`);
const pendingStudents = db.prepare(`
  SELECT DISTINCT s.id, s.gender, s.cgpa FROM students s
  JOIN preferences p ON p.student_id = s.id
  WHERE NOT EXISTS (SELECT 1 FROM allocations a WHERE a.student_id = s.id AND a.status = 'allocated')
  ORDER BY s.cgpa DESC, s.id ASC`);
const preferencesFor = db.prepare('SELECT hostel_code, room_type FROM preferences WHERE student_id = ? ORDER BY rank ASC');

function capacityFor(hostelCode, roomType) {
  const hostel = hostelByCode.get(hostelCode);
  if (!hostel) return { capacity: 0, gender: null };
  const counts = JSON.parse(hostel.room_counts);
  return { capacity: counts[ROOM_TYPE_KEYS[roomType]] || 0, gender: hostel.gender };
}

/**
 * Serial-dictatorship allocation: processes pending students in priority
 * order (CGPA desc), granting each the highest preference that still has
 * capacity. Mirrors how VIT's real seniority-based counselling batches run.
 */
export function runAllocation() {
  const students = pendingStudents.all();
  const result = { processed: 0, allocated: 0, waitlisted: 0 };
  db.transaction(() => {
    for (const student of students) {
      const prefs = preferencesFor.all(student.id);
      let placed = false;
      for (const pref of prefs) {
        const { capacity, gender } = capacityFor(pref.hostel_code, pref.room_type);
        if (gender !== student.gender) continue;
        const used = usedSeats.get(pref.hostel_code, pref.room_type)?.used || 0;
        if (used < capacity) {
          bumpUsedSeats.run(pref.hostel_code, pref.room_type);
          upsertAllocation.run(student.id, pref.hostel_code, pref.room_type, 'allocated');
          placed = true;
          result.allocated += 1;
          break;
        }
      }
      if (!placed) {
        upsertAllocation.run(student.id, null, null, 'waitlisted');
        result.waitlisted += 1;
      }
      result.processed += 1;
    }
  })();
  return result;
}

export function remainingSeats(hostelCode, roomType) {
  const { capacity } = capacityFor(hostelCode, roomType);
  const used = usedSeats.get(hostelCode, roomType)?.used || 0;
  return Math.max(0, capacity - used);
}
