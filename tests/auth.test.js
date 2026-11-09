import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSession, requireAuth, requireAdmin } from '../lib/auth.js';
import { resetState, seedStudent } from './helpers.js';

function mockRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

function mockReq(headers = {}) {
  return { get: (name) => headers[name.toLowerCase()] };
}

describe('requireAuth', () => {
  beforeEach(resetState);

  it('rejects a request with no bearer token', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an unknown token', () => {
    const req = mockReq({ authorization: 'Bearer not-a-real-token' });
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches the student and calls next for a valid token', () => {
    const studentId = seedStudent({ regNo: 'A1', email: 'a1@test.com', name: 'Ananya' });
    const token = createSession(studentId);
    const req = mockReq({ authorization: `Bearer ${token}` });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.student.id).toBe(studentId);
    expect(req.student.name).toBe('Ananya');
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('requireAdmin', () => {
  const originalKey = process.env.ADMIN_KEY;
  afterEach(() => { process.env.ADMIN_KEY = originalKey; });

  it('fails closed with 503 when ADMIN_KEY is not configured', () => {
    delete process.env.ADMIN_KEY;
    const req = mockReq({ 'x-admin-key': 'anything' });
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a wrong admin key with 403', () => {
    process.env.ADMIN_KEY = 'correct-secret';
    const req = mockReq({ 'x-admin-key': 'wrong-secret' });
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next for the correct admin key', () => {
    process.env.ADMIN_KEY = 'correct-secret';
    const req = mockReq({ 'x-admin-key': 'correct-secret' });
    const res = mockRes();
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
