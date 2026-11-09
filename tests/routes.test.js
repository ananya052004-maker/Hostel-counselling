import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { resetState } from './helpers.js';

describe('API routes', () => {
  beforeEach(resetState);

  it('GET /api/health reports ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'vit-hostel-guide-api' });
  });

  it('GET /api/branches returns the branch list with a disclaimer', async () => {
    const res = await request(app).get('/api/branches');
    expect(res.status).toBe(200);
    expect(res.body.branches.length).toBeGreaterThan(0);
    expect(res.body.disclaimer).toMatch(/not confirmed/i);
  });

  it('GET /api/hostels returns the seeded catalog', async () => {
    const res = await request(app).get('/api/hostels');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /api/hostels/:code 404s for an unknown block', async () => {
    const res = await request(app).get('/api/hostels/NOT-A-BLOCK');
    expect(res.status).toBe(404);
  });

  describe('auth + preferences flow', () => {
    it('identify on an unregistered email reveals the registration form', async () => {
      const res = await request(app).post('/api/auth/identify').send({ email: 'new-student@test.com' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ found: false });
    });

    it('rejects a malformed email', async () => {
      const res = await request(app).post('/api/auth/identify').send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('registers, then identify logs the same email straight in', async () => {
      const email = 'student@test.com';
      const register = await request(app).post('/api/auth/register').send({
        email, regNo: 'R1', name: 'Test Student', gender: 'mens', cgpa: 8.5, branch: 'CSE'
      });
      expect(register.status).toBe(201);
      expect(register.body.token).toBeTruthy();

      const identify = await request(app).post('/api/auth/identify').send({ email });
      expect(identify.status).toBe(200);
      expect(identify.body.found).toBe(true);
      expect(identify.body.student.email).toBe(email);
    });

    it('rejects a duplicate registration email with 409', async () => {
      const email = 'dup@test.com';
      await request(app).post('/api/auth/register').send({
        email, regNo: 'R2', name: 'A', gender: 'mens', cgpa: 8, branch: 'CSE'
      });
      const second = await request(app).post('/api/auth/register').send({
        email, regNo: 'R3', name: 'B', gender: 'mens', cgpa: 8, branch: 'CSE'
      });
      expect(second.status).toBe(409);
    });

    it('requires auth on /api/preferences', async () => {
      const res = await request(app).post('/api/preferences').send({ choices: [] });
      expect(res.status).toBe(401);
    });

    it('rejects a preference for an unknown hostel code', async () => {
      const register = await request(app).post('/api/auth/register').send({
        email: 'prefs@test.com', regNo: 'R4', name: 'C', gender: 'mens', cgpa: 8, branch: 'CSE'
      });
      const token = register.body.token;

      const res = await request(app)
        .post('/api/preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ choices: [{ hostelCode: 'NOT-REAL', roomType: '1' }] });

      expect(res.status).toBe(400);
    });

    it('accepts a valid ranked preference list', async () => {
      const register = await request(app).post('/api/auth/register').send({
        email: 'prefs2@test.com', regNo: 'R5', name: 'D', gender: 'mens', cgpa: 8, branch: 'CSE'
      });
      const token = register.body.token;
      const hostels = await request(app).get('/api/hostels?gender=mens');
      const target = hostels.body[0];

      const res = await request(app)
        .post('/api/preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({ choices: [{ hostelCode: target.code, roomType: target.roomTypes[0] }] });

      expect(res.status).toBe(201);

      const meRes = await request(app).get('/api/allocation/me').set('Authorization', `Bearer ${token}`);
      expect(meRes.body).toEqual({ status: 'not_processed' });
    });
  });

  describe('admin routes', () => {
    const originalKey = process.env.ADMIN_KEY;
    afterEach(() => { process.env.ADMIN_KEY = originalKey; });

    it('503s when ADMIN_KEY is not configured', async () => {
      delete process.env.ADMIN_KEY;
      const res = await request(app).post('/api/admin/run-allocation');
      expect(res.status).toBe(503);
    });

    it('403s with the wrong admin key', async () => {
      process.env.ADMIN_KEY = 'secret';
      const res = await request(app).post('/api/admin/run-allocation').set('x-admin-key', 'nope');
      expect(res.status).toBe(403);
    });

    it('runs an allocation round with the correct admin key', async () => {
      process.env.ADMIN_KEY = 'secret';
      const res = await request(app).post('/api/admin/run-allocation').set('x-admin-key', 'secret');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('processed');
    });
  });
});
