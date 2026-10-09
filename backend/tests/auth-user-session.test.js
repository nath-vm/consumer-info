/** Shared-password login, refresh and logout. Models are mocked; no database needed. */
jest.mock('../models/Consumer', () => ({}));
jest.mock('../models/RoverBook', () => ({}));
jest.mock('../models/AuditLog', () => ({ create: jest.fn().mockResolvedValue({}), find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../models/AdminConfig', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../models/RefreshToken', () => ({ create: jest.fn().mockResolvedValue({}), findOne: jest.fn(), updateOne: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) }));
jest.mock('@getbrevo/brevo', () => ({ BrevoClient: jest.fn() }));

const request = require('supertest');
const bcrypt = require('bcryptjs');
const createApp = require('../app');
const AdminConfig = require('../models/AdminConfig');
const RefreshToken = require('../models/RefreshToken');

const app = createApp();
const PASSWORD = 'correct-horse-battery';
let hash;

beforeAll(() => { hash = bcrypt.hashSync(PASSWORD, 4); });
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  AdminConfig.findOneAndUpdate.mockResolvedValue({ userAccessEnabled: true, userPassword: hash, adminGmails: ['admin@example.com'] });
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/auth/user-login', () => {
  test('correct password -> 200 and httpOnly cookies', async () => {
    const res = await request(app).post('/api/auth/user-login').send({ password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('user');
    const cookies = res.headers['set-cookie'].join(';');
    expect(cookies).toMatch(/accessToken=/);
    expect(cookies).toMatch(/refreshToken=/);
    expect(cookies).toMatch(/HttpOnly/i);
    expect(RefreshToken.create).toHaveBeenCalledTimes(1);
  });

  test('access cookie outlives the 15-minute JWT so the silent refresh can happen', async () => {
    const res = await request(app).post('/api/auth/user-login').send({ password: PASSWORD });
    const access = res.headers['set-cookie'].find((c) => c.startsWith('accessToken='));
    const maxAge = Number(/Max-Age=(\d+)/i.exec(access)[1]);
    expect(maxAge).toBeGreaterThan(15 * 60); // regression: used to be exactly 15 minutes
  });

  test('wrong password -> 401', async () => {
    const res = await request(app).post('/api/auth/user-login').send({ password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('missing password -> 400', async () => {
    const res = await request(app).post('/api/auth/user-login').send({});
    expect(res.status).toBe(400);
  });

  test('operator object instead of a password is rejected -> 400', async () => {
    const res = await request(app).post('/api/auth/user-login').send({ password: { $ne: null } });
    expect(res.status).toBe(400);
  });

  test('access disabled by admin -> 403 ACCESS_DISABLED', async () => {
    AdminConfig.findOneAndUpdate.mockResolvedValue({ userAccessEnabled: false, userPassword: hash, adminGmails: [] });
    const res = await request(app).post('/api/auth/user-login').send({ password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCESS_DISABLED');
  });

  test('database failure -> generic 500 (and the server stays up)', async () => {
    AdminConfig.findOneAndUpdate.mockRejectedValue(new Error('secret db detail'));
    const res = await request(app).post('/api/auth/user-login').send({ password: PASSWORD });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/secret db detail/);
  });

  test('no debug output of the bcrypt result is logged', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    await request(app).post('/api/auth/user-login').send({ password: PASSWORD });
    expect(log.mock.calls.flat().join(' ')).not.toMatch(/bcrypt/i);
  });
});

describe('POST /api/auth/refresh', () => {
  const liveRecord = (role = 'user', consumerId = 'user-session') =>
    ({ token: 'abc', role, consumerId, expiresAt: new Date(Date.now() + 60_000), revoked: false });

  // REGRESSION: the original code passed req.body.refreshToken / the cookie straight into
  // RefreshToken.findOne({ token }). An object like {"$ne": null} matched ANOTHER person's live
  // session record and returned its access token (possibly an admin's).
  test('NoSQL operator in the JSON body is rejected and never reaches the database', async () => {
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken: { $ne: null } });
    expect(res.status).toBe(400);
    expect(RefreshToken.findOne).not.toHaveBeenCalled();
  });

  test('NoSQL operator smuggled in a j: JSON cookie is rejected and never reaches the database', async () => {
    const res = await request(app).post('/api/auth/refresh').set('Cookie', ['refreshToken=j:' + JSON.stringify({ $ne: null })]);
    expect(res.status).toBe(400);
    expect(RefreshToken.findOne).not.toHaveBeenCalled();
  });

  test('valid refresh token -> new access cookie, and NO token in the JSON body', async () => {
    RefreshToken.findOne.mockResolvedValue(liveRecord());
    const res = await request(app).post('/api/auth/refresh').set('Cookie', ['refreshToken=abc']);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeUndefined();
    expect(res.headers['set-cookie'].join(';')).toMatch(/accessToken=/);
    expect(RefreshToken.findOne).toHaveBeenCalledWith({ token: 'abc', revoked: false });
  });

  test('unknown / revoked token -> 401', async () => {
    RefreshToken.findOne.mockResolvedValue(null);
    const res = await request(app).post('/api/auth/refresh').set('Cookie', ['refreshToken=zzz']);
    expect(res.status).toBe(401);
  });

  test('expired refresh record -> 401', async () => {
    RefreshToken.findOne.mockResolvedValue({ ...liveRecord(), expiresAt: new Date(Date.now() - 1000) });
    const res = await request(app).post('/api/auth/refresh').set('Cookie', ['refreshToken=abc']);
    expect(res.status).toBe(401);
  });

  test('admin whose Gmail was removed from the whitelist cannot refresh', async () => {
    RefreshToken.findOne.mockResolvedValue(liveRecord('admin', 'removed@example.com'));
    const res = await request(app).post('/api/auth/refresh').set('Cookie', ['refreshToken=abc']);
    expect(res.status).toBe(401);
    expect(RefreshToken.updateOne).toHaveBeenCalledWith({ token: 'abc' }, { revoked: true });
  });

  test('user session is refused after the admin disables user access', async () => {
    RefreshToken.findOne.mockResolvedValue(liveRecord());
    AdminConfig.findOneAndUpdate.mockResolvedValue({ userAccessEnabled: false, adminGmails: [] });
    const res = await request(app).post('/api/auth/refresh').set('Cookie', ['refreshToken=abc']);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCESS_DISABLED');
  });
});

describe('POST /api/auth/logout', () => {
  test('revokes the refresh token and clears cookies', async () => {
    const res = await request(app).post('/api/auth/logout').set('Cookie', ['refreshToken=abc']);
    expect(res.status).toBe(200);
    expect(RefreshToken.updateOne).toHaveBeenCalledWith({ token: 'abc' }, { revoked: true });
    expect(res.headers['set-cookie'].join(';')).toMatch(/accessToken=;/);
  });

  test('operator object in the cookie cannot revoke other people\'s sessions', async () => {
    await request(app).post('/api/auth/logout').set('Cookie', ['refreshToken=j:' + JSON.stringify({ $ne: null })]);
    expect(RefreshToken.updateOne).not.toHaveBeenCalled();
  });
});

describe('GET /api/auth/check-auth', () => {
  test('anonymous -> authenticated:false', async () => {
    const res = await request(app).get('/api/auth/check-auth');
    expect(res.body).toEqual({ authenticated: false });
  });
});
