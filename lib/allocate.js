import { db, ROOM_TYPE_KEYS, branchStrengthMap } from '../db.js';

const hostelByCode = db.prepare('SELECT gender, room_counts FROM hostels WHERE code = ?');
const usedSeats = db.prepare('SELECT used FROM seat_usage WHERE hostel_code = ? AND room_type = ?');
const allSeatUsage = db.prepare('SELECT hostel_code, room_type, used FROM seat_usage');
const bumpUsedSeats = db.prepare(`INSERT INTO seat_usage (hostel_code, room_type, used) VALUES (?, ?, 1)
  ON CONFLICT(hostel_code, room_type) DO UPDATE SET used = used + 1`);
const upsertAllocation = db.prepare(`INSERT INTO allocations (student_id, hostel_code, room_type, status, allocated_at)
  VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT(student_id) DO UPDATE SET hostel_code = excluded.hostel_code, room_type = excluded.room_type,
    status = excluded.status, allocated_at = excluded.allocated_at`);
const pendingStudents = db.prepare(`
  SELECT DISTINCT s.id, s.gender, s.cgpa, s.branch FROM students s
  JOIN preferences p ON p.student_id = s.id
  WHERE NOT EXISTS (SELECT 1 FROM allocations a WHERE a.student_id = s.id AND a.status = 'allocated')`);
const preferencesFor = db.prepare('SELECT hostel_code, room_type FROM preferences WHERE student_id = ? ORDER BY rank ASC');
const allocationFor = db.prepare('SELECT status, hostel_code AS hostelCode, room_type AS roomType FROM allocations WHERE student_id = ?');
const hostelNameMap = new Map(db.prepare('SELECT code, name FROM hostels').all().map((h) => [h.code, h.name]));

function capacityFor(hostelCode, roomType) {
  const hostel = hostelByCode.get(hostelCode);
  if (!hostel) return { capacity: 0, gender: null };
  const counts = JSON.parse(hostel.room_counts);
  return { capacity: counts[ROOM_TYPE_KEYS[roomType]] || 0, gender: hostel.gender };
}

/**
 * Priority rule: students from a smaller branch (by approx strength) go
 * first as a whole tier; within the same branch, higher CGPA goes first.
 * Unrecognized branches sort last.
 */
function byPriority(a, b) {
  const branchA = branchStrengthMap.get(a.branch) ?? Infinity;
  const branchB = branchStrengthMap.get(b.branch) ?? Infinity;
  if (branchA !== branchB) return branchA - branchB;
  if (a.cgpa !== b.cgpa) return b.cgpa - a.cgpa;
  return a.id - b.id;
}

/**
 * Serial-dictatorship allocation: processes pending students in priority
 * order (smaller branch tier first, then CGPA desc within a branch),
 * granting each the highest preference that still has capacity. Mirrors
 * how VIT's real seniority-based counselling batches run.
 */
export function runAllocation() {
  const students = pendingStudents.all().sort(byPriority);
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

/**
 * Non-destructive "what would I get right now" estimate. Replays the same
 * priority order and seat logic as runAllocation() in memory (no writes),
 * starting from real committed seat usage. A student already locked in as
 * 'allocated' by a real run gets that final result back untouched; a
 * 'waitlisted' real result is still live (waitlisted students are
 * reconsidered on the next run), so it's recomputed like anyone pending.
 *
 * Also returns `breakdown`: every one of the student's ranked choices,
 * annotated with what would happen to it — 'would_get' (the one they'd be
 * granted), 'full' (a higher/equal-priority student already has every
 * seat), or 'not_reached' (ranked below the one they'd get, so the
 * algorithm never gets to it). This only requires replaying students
 * strictly ahead of the target in priority order, then walking the
 * target's own list once — nothing after the target affects it.
 */
export function previewAllocation(studentId) {
  const finalResult = allocationFor.get(studentId);
  if (finalResult && finalResult.status === 'allocated') {
    return { final: true, breakdown: [], ...finalResult, hostelName: hostelNameMap.get(finalResult.hostelCode) || null };
  }

  const students = pendingStudents.all().sort(byPriority);
  const target = students.find((student) => student.id === studentId);
  const targetPrefs = preferencesFor.all(studentId);
  if (!target || targetPrefs.length === 0) {
    return { final: false, status: 'no_preferences', breakdown: [] };
  }

  const usage = new Map(allSeatUsage.all().map((row) => [`${row.hostel_code}:${row.room_type}`, row.used]));
  for (const student of students) {
    if (student.id === studentId) break;
    const prefs = preferencesFor.all(student.id);
    for (const pref of prefs) {
      const { capacity, gender } = capacityFor(pref.hostel_code, pref.room_type);
      if (gender !== student.gender) continue;
      const key = `${pref.hostel_code}:${pref.room_type}`;
      const used = usage.get(key) || 0;
      if (used < capacity) {
        usage.set(key, used + 1);
        break;
      }
    }
  }

  let resolved = false;
  let result = { status: 'likely_waitlisted' };
  const breakdown = targetPrefs.map((pref, index) => {
    const entry = { rank: index + 1, hostelCode: pref.hostel_code, roomType: pref.room_type, hostelName: hostelNameMap.get(pref.hostel_code) || null };
    if (resolved) return { ...entry, status: 'not_reached' };
    const { capacity, gender } = capacityFor(pref.hostel_code, pref.room_type);
    if (gender !== target.gender) return { ...entry, status: 'full' };
    const key = `${pref.hostel_code}:${pref.room_type}`;
    const used = usage.get(key) || 0;
    if (used < capacity) {
      usage.set(key, used + 1);
      resolved = true;
      result = { status: 'likely_allocated', hostelCode: pref.hostel_code, roomType: pref.room_type };
      return { ...entry, status: 'would_get' };
    }
    return { ...entry, status: 'full' };
  });

  return { final: false, breakdown, ...result, hostelName: hostelNameMap.get(result.hostelCode) || null };
}
