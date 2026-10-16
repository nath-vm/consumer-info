const request = require('supertest');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');

// Models and the Google client are mocked, so the tests run without a database or network.
jest.mock('../models/Consumer');
jest.mock('../models/RoverBook');
jest.mock('../models/AdminConfig');
jest.mock('../models/AuditLog');
jest.mock('../models/RefreshToken');
jest.mock('google-auth-library', () => {
  const verifyIdToken = jest.fn();
  return { OAuth2Client: jest.fn(() => ({ verifyIdToken })), __verify: verifyIdToken };
});

const Consumer     = require('../models/Consumer');
const AdminConfig  = require('../models/AdminConfig');
const AuditLog     = require('../models/AuditLog');
const RefreshToken = require('../models/RefreshToken');
const { __verify: verifyIdToken } = require('google-auth-library');
const app = require('../app')();

const ID = '507f1f77bcf86cd799439011';

const tokenFor = (role, extra = {}, opts = { expiresIn: '10m' }) =>
  jwt.sign({ role, sub: role === 'admin' ? 'admin@example.com' : 'user-session', ...extra }, process.env.JWT_SECRET, opts);
const asUser  = () => ['accessToken=' + tokenFor('user')];
const asAdmin = () => ['accessToken=' + tokenFor('admin', { email: 'admin@example.com' })];

// Mongoose-style chain: find().sort().skip().limit().lean()
const { queryChain } = require('./helpers');
const findChain = (rows = []) => queryChain(rows);
const lastFilter = () => Consumer.find.mock.calls[Consumer.find.mock.calls.length - 1][0];

beforeEach(() => {
  jest.clearAllMocks();
  AuditLog.create.mockResolvedValue({});
  RefreshToken.create.mockResolvedValue({});
  Consumer.find.mockReturnValue(findChain());
  Consumer.countDocuments.mockResolvedValue(0);
});

describe('health and routing', () => {
  test('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  test('unknown routes return a JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Not found');
  });

  test('sets security headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('consumer data requires login (enforced on the server)', () => {
  test('search without a token is rejected', async () => {
    const res = await request(app).get('/api/consumers/search?query=abc');
    expect(res.status).toBe(401);
    expect(Consumer.find).not.toHaveBeenCalled();
  });

  test('single-consumer lookup without a token is rejected', async () => {
    const res = await request(app).get(`/api/consumers/${ID}`);
    expect(res.status).toBe(401);
  });

  test('a logged-in user can search', async () => {
    const res = await request(app).get('/api/consumers/search?query=abc').set('Cookie', asUser());
    expect(res.status).toBe(200);
    expect(Consumer.find).toHaveBeenCalled();
  });

  test('a logged-in admin can search', async () => {
    const res = await request(app).get('/api/consumers/search').set('Cookie', asAdmin());
    expect(res.status).toBe(200);
  });

  test('a forged token is rejected', async () => {
    const forged = jwt.sign({ role: 'admin', email: 'x@y.z' }, 'another-secret');
    const res = await request(app).get('/api/consumers/search').set('Cookie', ['accessToken=' + forged]);
    expect(res.status).toBe(401);
  });

  test('an expired token returns TOKEN_EXPIRED so the frontend can refresh', async () => {
    const expired = tokenFor('user', {}, { expiresIn: -10 });
    const res = await request(app).get('/api/consumers/search').set('Cookie', ['accessToken=' + expired]);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  test('rover-book lookup is no longer public', async () => {
    const res = await request(app).get('/api/rover-book/lookup/12');
    expect(res.status).toBe(401);
  });
});

describe('role separation', () => {
  test('a normal user cannot create consumers', async () => {
    const res = await request(app).post('/api/consumers').set('Cookie', asUser()).send({ accountName: 'x' });
    expect(res.status).toBe(403);
  });

  test('a normal user cannot read the admin audit log', async () => {
    const res = await request(app).get('/api/auth/audit-log').set('Cookie', asUser());
    expect(res.status).toBe(403);
  });

  test('bulk-import endpoints reject anonymous callers before parsing the body', async () => {
    const res = await request(app).post('/api/consumers/batch-upsert').send([{ accountNumber: '1' }]);
    expect(res.status).toBe(401);
  });
});

describe('hidden records are admin-only', () => {
  test('a user asking for includeHidden=true still only gets active records', async () => {
    await request(app).get('/api/consumers/search?includeHidden=true').set('Cookie', asUser());
    expect(lastFilter()).toEqual({ isHidden: { $ne: true } });
  });

  test('an admin asking for includeHidden=true gets hidden records', async () => {
    await request(app).get('/api/consumers/search?includeHidden=true').set('Cookie', asAdmin());
    expect(lastFilter()).toEqual({ isHidden: true });
  });

  test('a hidden consumer looks like "not found" to a normal user', async () => {
    Consumer.findById.mockResolvedValue({ _id: ID, isHidden: true });
    const res = await request(app).get(`/api/consumers/${ID}`).set('Cookie', asUser());
    expect(res.status).toBe(404);
  });
});

describe('search', () => {
  test('field filter is honoured when it is on the allow-list', async () => {
    await request(app).get('/api/consumers/search?query=abc&field=accountNumber').set('Cookie', asUser());
    const f = lastFilter();
    expect(f.$or).toHaveLength(1);
    expect(f.$or[0].accountNumber).toBeInstanceOf(RegExp);
  });

  test('an unknown field is ignored and all fields are searched', async () => {
    await request(app).get('/api/consumers/search?query=abc&field=passwordHash').set('Cookie', asUser());
    const f = lastFilter();
    expect(f.passwordHash).toBeUndefined();
    expect(Array.isArray(f.$or)).toBe(true);
  });

  test('regex characters in the query are escaped', async () => {
    await request(app).get('/api/consumers/search?query=' + encodeURIComponent('(a+)+$')).set('Cookie', asUser());
    expect(lastFilter().$or[0].sn.source).toBe('\\(a\\+\\)\\+\\$');
  });

  test('overly long queries are cut down to 100 characters', async () => {
    const res = await request(app).get('/api/consumers/search?query=' + 'a'.repeat(101)).set('Cookie', asUser());
    expect(res.status).toBe(200);
    expect(lastFilter().$or[0].sn.source).toHaveLength(100);
  });
});

describe('input validation', () => {
  test('malformed ids return 400 instead of a 500', async () => {
    const res = await request(app).put('/api/consumers/not-an-id/hide').set('Cookie', asAdmin());
    expect(res.status).toBe(400);
  });
});

describe('user login', () => {
  const cfg = async (over = {}) => ({ userAccessEnabled: true, userPassword: await bcrypt.hash('correct-horse-123', 4), ...over });

  test('wrong password returns 401', async () => {
    AdminConfig.findOneAndUpdate.mockResolvedValue(await cfg());
    const res = await request(app).post('/api/auth/user-login').send({ password: 'nope' });
    expect(res.status).toBe(401);
  });

  test('correct password sets an httpOnly access cookie', async () => {
    AdminConfig.findOneAndUpdate.mockResolvedValue(await cfg());
    const res = await request(app).post('/api/auth/user-login').send({ password: 'correct-horse-123' });
    expect(res.status).toBe(200);
    const cookies = res.headers['set-cookie'].join(';');
    expect(cookies).toMatch(/accessToken=/);
    expect(cookies).toMatch(/HttpOnly/i);
  });

  test('login is refused while user access is disabled', async () => {
    AdminConfig.findOneAndUpdate.mockResolvedValue(await cfg({ userAccessEnabled: false }));
    const res = await request(app).post('/api/auth/user-login').send({ password: 'correct-horse-123' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCESS_DISABLED');
  });

  test('a non-string password is rejected', async () => {
    const res = await request(app).post('/api/auth/user-login').send({ password: { $ne: '' } });
    expect(res.status).toBe(400);
  });
});

describe('admin login (Google)', () => {
  const approved = () => ({ adminGmails: ['admin@example.com'], save: jest.fn() });

  test('an approved, verified Google account is let in', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'Admin@Example.com', email_verified: true }) });
    AdminConfig.findOneAndUpdate.mockResolvedValue(approved());
    const res = await request(app).post('/api/auth/admin-login').send({ credential: 'google-id-token' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');
  });

  test('an unverified Google email is rejected', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'admin@example.com', email_verified: false }) });
    AdminConfig.findOneAndUpdate.mockResolvedValue(approved());
    const res = await request(app).post('/api/auth/admin-login').send({ credential: 'google-id-token' });
    expect(res.status).toBe(401);
  });

  test('a Google account that is not on the whitelist is rejected', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => ({ email: 'stranger@example.com', email_verified: true }) });
    AdminConfig.findOneAndUpdate.mockResolvedValue(approved());
    const res = await request(app).post('/api/auth/admin-login').send({ credential: 'google-id-token' });
    expect(res.status).toBe(403);
  });

  test('an invalid Google token is rejected', async () => {
    verifyIdToken.mockRejectedValue(new Error('bad token'));
    const res = await request(app).post('/api/auth/admin-login').send({ credential: 'garbage' });
    expect(res.status).toBe(401);
  });
});

describe('error handling', () => {
  test('database errors never leak internal details to the client', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    Consumer.countDocuments.mockRejectedValue(new Error('mongodb://secret-host connection failure'));
    const res = await request(app).get('/api/consumers/search').set('Cookie', asUser());
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret-host/);
    spy.mockRestore();
  });
});
