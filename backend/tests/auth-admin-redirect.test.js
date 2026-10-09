/**
 * Redirect-mode Google sign-in (no popup). Google's own page POSTs a form to the API, so this
 * endpoint is reachable cross-site and MUST enforce Google's double-submit CSRF check.
 * Exactly 5 requests: stays under the 5/15min strict limiter.
 */
const mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => ({ OAuth2Client: jest.fn(() => ({ verifyIdToken: mockVerifyIdToken })) }));
jest.mock('../models/Consumer', () => ({}));
jest.mock('../models/RoverBook', () => ({}));
jest.mock('../models/AuditLog', () => ({ create: jest.fn().mockResolvedValue({}), find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../models/AdminConfig', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../models/RefreshToken', () => ({ create: jest.fn().mockResolvedValue({}), findOne: jest.fn(), updateOne: jest.fn(), updateMany: jest.fn() }));
jest.mock('@getbrevo/brevo', () => ({ BrevoClient: jest.fn() }));

const request = require('supertest');
const createApp = require('../app');
const AdminConfig = require('../models/AdminConfig');

const app = createApp();
const ticket = (payload) => ({ getPayload: () => payload });
const post = (cookieToken, bodyToken, credential = 'google-token') => {
  const r = request(app).post('/api/auth/admin-login-redirect').type('form');
  if (cookieToken) r.set('Cookie', [`g_csrf_token=${cookieToken}`]);
  return r.send({ credential, g_csrf_token: bodyToken });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  AdminConfig.findOneAndUpdate.mockResolvedValue({ adminGmails: ['admin@example.com'], save: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());

test('CSRF token in cookie and form must match, otherwise Google is never even asked', async () => {
  const res = await post('aaa', 'bbb');
  expect(res.status).toBe(303);
  expect(res.headers.location).toBe('/p3-admin?login_error=csrf');
  expect(res.headers['set-cookie']).toBeUndefined();
  expect(mockVerifyIdToken).not.toHaveBeenCalled();
});

test('missing CSRF cookie is rejected', async () => {
  const res = await post(null, 'bbb');
  expect(res.headers.location).toBe('/p3-admin?login_error=csrf');
  expect(mockVerifyIdToken).not.toHaveBeenCalled();
});

test('verified Google account that is not whitelisted is redirected back with an error, no cookies', async () => {
  mockVerifyIdToken.mockResolvedValue(ticket({ email: 'stranger@example.com', email_verified: true }));
  const res = await post('tok', 'tok');
  expect(res.status).toBe(303);
  expect(res.headers.location).toBe('/p3-admin?login_error=not_approved');
  expect(res.headers['set-cookie']).toBeUndefined();
});

test('unverified email is refused', async () => {
  mockVerifyIdToken.mockResolvedValue(ticket({ email: 'admin@example.com', email_verified: false }));
  const res = await post('tok', 'tok');
  expect(res.headers.location).toBe('/p3-admin?login_error=invalid');
  expect(res.headers['set-cookie']).toBeUndefined();
});

test('whitelisted + valid CSRF -> httpOnly session cookies and redirect to the app', async () => {
  mockVerifyIdToken.mockResolvedValue(ticket({ email: 'Admin@Example.com', email_verified: true }));
  const res = await post('tok', 'tok');
  expect(res.status).toBe(303);
  expect(res.headers.location).toBe('/');
  const cookies = res.headers['set-cookie'].join(';');
  expect(cookies).toMatch(/accessToken=/);
  expect(cookies).toMatch(/refreshToken=/);
  expect(cookies).toMatch(/HttpOnly/i);
});
