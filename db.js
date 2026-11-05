import Database from 'better-sqlite3';
import { getSeedHostels } from './src/data.js';

export const db = new Database('data/hostels.db');
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS hostels (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  gender TEXT NOT NULL, type TEXT NOT NULL, phone TEXT, beds TEXT, room_types TEXT NOT NULL,
  tags TEXT NOT NULL, mess TEXT, image TEXT, room_counts TEXT NOT NULL, description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reg_no TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK(gender IN ('mens','ladies')),
  cgpa REAL NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS preferences (
  student_id INTEGER NOT NULL REFERENCES students(id),
  rank INTEGER NOT NULL,
  hostel_code TEXT NOT NULL,
  room_type TEXT NOT NULL,
  PRIMARY KEY (student_id, rank)
);
CREATE TABLE IF NOT EXISTS allocations (
  student_id INTEGER PRIMARY KEY REFERENCES students(id),
  hostel_code TEXT,
  room_type TEXT,
  status TEXT NOT NULL CHECK(status IN ('allocated','waitlisted')),
  allocated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS seat_usage (
  hostel_code TEXT NOT NULL,
  room_type TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hostel_code, room_type)
);`);

const insertHostel = db.prepare(`INSERT OR IGNORE INTO hostels
  (code,name,gender,type,phone,beds,room_types,tags,mess,image,room_counts,description)
  VALUES (@code,@name,@gender,@type,@phone,@beds,@roomTypes,@tags,@mess,@image,@roomCounts,@description)`);
const seed = db.transaction((rows) => rows.forEach((row) => insertHostel.run({
  ...row, roomTypes: JSON.stringify(row.roomTypes), tags: JSON.stringify(row.tags), roomCounts: JSON.stringify(row.roomCounts)
})));
seed(getSeedHostels());
db.prepare("DELETE FROM hostels WHERE type = 'Apartment' AND code IN ('MA 1', 'MA 2', 'WA 1', 'WA 2')").run();
seed(getSeedHostels().filter((row) => row.type === 'Apartment'));

export const ROOM_TYPE_KEYS = { 1: 'single', 2: 'double', 3: 'triple', 4: 'four', 6: 'six' };
