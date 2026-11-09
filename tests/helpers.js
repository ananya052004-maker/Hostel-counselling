import { db } from '../db.js';

export function resetState() {
  db.exec('DELETE FROM seat_usage; DELETE FROM allocations; DELETE FROM preferences; DELETE FROM sessions; DELETE FROM students;');
}

export function seedHostel({ code, gender = 'mens', roomTypes = ['1'], roomCounts = { single: 1 } }) {
  db.prepare(`INSERT OR REPLACE INTO hostels
    (code,name,gender,type,phone,beds,room_types,tags,mess,image,room_counts,description)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    code, code, gender, 'Hostel', '000', '1 bed',
    JSON.stringify(roomTypes), JSON.stringify(['Non-AC']), 'Mess', '',
    JSON.stringify(roomCounts), 'Test hostel'
  );
}

export function seedStudent({ regNo, email, name = 'Test Student', gender = 'mens', cgpa = 8, branch = 'CSE' }) {
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO students (reg_no, email, name, gender, cgpa, branch) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(regNo, email, name, gender, cgpa, branch);
  return lastInsertRowid;
}

export function seedPreference(studentId, rank, hostelCode, roomType) {
  db.prepare('INSERT INTO preferences (student_id, rank, hostel_code, room_type) VALUES (?, ?, ?, ?)')
    .run(studentId, rank, hostelCode, roomType);
}
