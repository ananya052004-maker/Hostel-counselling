import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db.js';
import { runAllocation, previewAllocation, remainingSeats } from '../lib/allocate.js';
import { resetState, seedHostel, seedStudent, seedPreference } from './helpers.js';

describe('runAllocation', () => {
  beforeEach(() => {
    resetState();
    seedHostel({ code: 'TEST-1', gender: 'mens', roomTypes: ['1'], roomCounts: { single: 1 } });
  });

  it('prioritizes the smaller branch over the larger branch regardless of CGPA', () => {
    // CIVIL (120) is a far smaller branch than CSE (1200) in the seed data.
    const small = seedStudent({ regNo: 'S1', email: 's1@test.com', branch: 'CIVIL', cgpa: 6 });
    const large = seedStudent({ regNo: 'S2', email: 's2@test.com', branch: 'CSE', cgpa: 9.5 });
    seedPreference(small, 1, 'TEST-1', '1');
    seedPreference(large, 1, 'TEST-1', '1');

    const result = runAllocation();

    expect(result).toEqual({ processed: 2, allocated: 1, waitlisted: 1 });
    expect(db.prepare('SELECT status FROM allocations WHERE student_id = ?').get(small).status).toBe('allocated');
    expect(db.prepare('SELECT status FROM allocations WHERE student_id = ?').get(large).status).toBe('waitlisted');
  });

  it('breaks ties within the same branch by higher CGPA first', () => {
    const higher = seedStudent({ regNo: 'S3', email: 's3@test.com', branch: 'CIVIL', cgpa: 9 });
    const lower = seedStudent({ regNo: 'S4', email: 's4@test.com', branch: 'CIVIL', cgpa: 7 });
    seedPreference(lower, 1, 'TEST-1', '1');
    seedPreference(higher, 1, 'TEST-1', '1');

    runAllocation();

    expect(db.prepare('SELECT status FROM allocations WHERE student_id = ?').get(higher).status).toBe('allocated');
    expect(db.prepare('SELECT status FROM allocations WHERE student_id = ?').get(lower).status).toBe('waitlisted');
  });

  it('never oversells a seat even with more ranked choices than capacity', () => {
    seedHostel({ code: 'TEST-2', gender: 'mens', roomTypes: ['1'], roomCounts: { single: 2 } });
    const students = ['CIVIL', 'CIVIL', 'CIVIL', 'CHEM'].map((branch, i) =>
      seedStudent({ regNo: `S${10 + i}`, email: `s${10 + i}@test.com`, branch, cgpa: 8 - i })
    );
    students.forEach((id) => seedPreference(id, 1, 'TEST-2', '1'));

    const result = runAllocation();

    expect(result.allocated).toBe(2);
    expect(result.waitlisted).toBe(2);
    expect(remainingSeats('TEST-2', '1')).toBe(0);
  });

  it('skips a preference whose gender does not match the student and leaves them waitlisted', () => {
    seedHostel({ code: 'TEST-LADIES', gender: 'ladies', roomTypes: ['1'], roomCounts: { single: 5 } });
    const mensStudent = seedStudent({ regNo: 'S20', email: 's20@test.com', gender: 'mens', branch: 'CIVIL', cgpa: 9 });
    seedPreference(mensStudent, 1, 'TEST-LADIES', '1');

    runAllocation();

    expect(db.prepare('SELECT status FROM allocations WHERE student_id = ?').get(mensStudent).status).toBe('waitlisted');
    expect(remainingSeats('TEST-LADIES', '1')).toBe(5);
  });

  it('is reentrant: a second run only processes newly pending students', () => {
    const first = seedStudent({ regNo: 'S30', email: 's30@test.com', branch: 'CIVIL', cgpa: 8 });
    seedPreference(first, 1, 'TEST-1', '1');
    expect(runAllocation()).toEqual({ processed: 1, allocated: 1, waitlisted: 0 });

    const second = seedStudent({ regNo: 'S31', email: 's31@test.com', branch: 'CHEM', cgpa: 8 });
    seedPreference(second, 1, 'TEST-1', '1');
    const result = runAllocation();

    expect(result).toEqual({ processed: 1, allocated: 0, waitlisted: 1 });
  });
});

describe('previewAllocation', () => {
  beforeEach(() => {
    resetState();
    seedHostel({ code: 'TEST-1', gender: 'mens', roomTypes: ['1'], roomCounts: { single: 1 } });
  });

  it('matches what a real run would decide, before any run happens', () => {
    const winner = seedStudent({ regNo: 'P1', email: 'p1@test.com', branch: 'CIVIL', cgpa: 9 });
    const loser = seedStudent({ regNo: 'P2', email: 'p2@test.com', branch: 'CSE', cgpa: 9 });
    seedPreference(winner, 1, 'TEST-1', '1');
    seedPreference(loser, 1, 'TEST-1', '1');

    expect(previewAllocation(winner).status).toBe('likely_allocated');
    expect(previewAllocation(loser).status).toBe('likely_waitlisted');

    runAllocation();

    expect(previewAllocation(winner)).toMatchObject({ final: true, status: 'allocated' });
  });

  it('tags each ranked choice as would_get, full, or not_reached', () => {
    seedHostel({ code: 'TEST-2', gender: 'mens', roomTypes: ['1'], roomCounts: { single: 1 } });
    const blocker = seedStudent({ regNo: 'P3', email: 'p3@test.com', branch: 'CIVIL', cgpa: 10 });
    seedPreference(blocker, 1, 'TEST-1', '1');
    runAllocation();

    const student = seedStudent({ regNo: 'P4', email: 'p4@test.com', branch: 'CSE', cgpa: 5 });
    seedPreference(student, 1, 'TEST-1', '1'); // already full, from blocker
    seedPreference(student, 2, 'TEST-2', '1'); // open

    const preview = previewAllocation(student);

    expect(preview.breakdown[0].status).toBe('full');
    expect(preview.breakdown[1].status).toBe('would_get');
  });

  it('reports no_preferences for a student who has not ranked anything', () => {
    const student = seedStudent({ regNo: 'P5', email: 'p5@test.com' });
    expect(previewAllocation(student).status).toBe('no_preferences');
  });
});
