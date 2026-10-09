/** Google admin login. The Google verification call is mocked. (4 requests: stays under the 5/15min limiter.) */
const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({ OAuth2Client: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })) }));
jest.mock('../models/Consumer', () => ({}));
jest.mock('../models/RoverBook', () => ({}));
jest.mock('../models/AuditLog', () => ({ create: jest.fn().mockResolvedValue({}), find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../models/AdminConfig', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../models/RefreshToken', () => ({ create: jest.fn().mockResolvedValue({}), findOne: jest.fn(), updateOne: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) }));
jest.mock('@getbrevo/brevo', () => ({ BrevoClient: jest.fn() }));

const request = require('supertest');
const createApp = require('../app');
const AdminConfig = require('../models/AdminConfig');

const app = createApp();
const ticket = (payload) => ({ getPayload: () => payload });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  AdminConfig.findOneAndUpdate.mockResolvedValue({ adminGmails: ['admin@example.com'], save: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());

test('non-string credential is rejected before Google is contacted', async () => {
  const res = await request(app).post('/api/auth/admin-login').send({ credential: { $ne: null } });
  expect(res.status).toBe(400);
  expect(mockVerifyIdToken).not.toHaveBeenCalled();
});

test('Google account with an UNVERIFIED email is refused', async () => {
  mockVerifyIdToken.mockResolvedValue(ticket({ email: 'admin@example.com', email_verified: false }));
  const res = await request(app).post('/api/auth/admin-login').send({ credential: 'google-token' });
  expect(res.status).toBe(401);
  expect(res.headers['set-cookie']).toBeUndefined();
});

test('verified Google account that is NOT on the whitelist -> 403', async () => {
  mockVerifyIdToken.mockResolvedValue(ticket({ email: 'stranger@example.com', email_verified: true }));
  const res = await request(app).post('/api/auth/admin-login').send({ credential: 'google-token' });
  expect(res.status).toBe(403);
  expect(res.headers['set-cookie']).toBeUndefined();
});

test('verified + whitelisted -> 200 admin, httpOnly cookies, case-insensitive email', async () => {
  mockVerifyIdToken.mockResolvedValue(ticket({ email: 'Admin@Example.com', email_verified: true }));
  const res = await request(app).post('/api/auth/admin-login').send({ credential: 'google-token' });
  expect(res.status).toBe(200);
  expect(res.body.role).toBe('admin');
  expect(res.headers['set-cookie'].join(';')).toMatch(/HttpOnly/i);
});
