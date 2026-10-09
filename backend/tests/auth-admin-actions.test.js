/** Admin settings endpoints: input validation. Models mocked. (Few requests: strict limiter is 5/15min.) */
jest.mock('../models/Consumer', () => ({}));
jest.mock('../models/RoverBook', () => ({}));
jest.mock('../models/AuditLog', () => ({ create: jest.fn().mockResolvedValue({}), find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../models/AdminConfig', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../models/RefreshToken', () => ({ create: jest.fn().mockResolvedValue({}), findOne: jest.fn(), updateOne: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) }));
jest.mock('@getbrevo/brevo', () => ({ BrevoClient: jest.fn() }));

const request = require('supertest');
const createApp = require('../app');
const AdminConfig = require('../models/AdminConfig');
const AuditLog = require('../models/AuditLog');
const { adminToken, asCookie } = require('./helpers');

const app = createApp();
const admin = () => ({ Cookie: asCookie(adminToken()) });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  AdminConfig.findOneAndUpdate.mockResolvedValue({ adminGmails: [], notificationEmails: [], save: jest.fn() });
});
afterEach(() => jest.restoreAllMocks());

test('shared user password shorter than 8 characters is refused', async () => {
  const res = await request(app).post('/api/auth/user-password').set(admin()).send({ userPassword: 'short' });
  expect(res.status).toBe(400);
});

test('non-string password is refused (no TypeError / 500)', async () => {
  const res = await request(app).post('/api/auth/user-password').set(admin()).send({ userPassword: { a: 1 } });
  expect(res.status).toBe(400);
});

test('notification emails must be an array of strings', async () => {
  const res = await request(app).put('/api/auth/notification-emails').set(admin()).send({ notificationEmails: [123, { a: 1 }] });
  expect(res.status).toBe(400);
});

test('audit-log filter treats regex characters literally and survives array params', async () => {
  const chain = { sort: () => chain, skip: () => chain, limit: () => Promise.resolve([]) };
  AuditLog.find.mockReturnValue(chain);
  AuditLog.countDocuments.mockResolvedValue(0);
  const res = await request(app).get('/api/auth/audit-log?action=' + encodeURIComponent('(((') + '&actor[]=x').set(admin());
  expect(res.status).toBe(200); // an unescaped "(((" used to throw "Invalid regular expression" -> 500
  expect(AuditLog.find.mock.calls[0][0].action.source).toBe('\\(\\(\\(');
});

test('config endpoint never exposes the password hash', async () => {
  AdminConfig.findOneAndUpdate.mockResolvedValue({
    userAccessEnabled: true, userPassword: '$2a$10$secrethash', passwordRotation: 'manual',
    adminGmails: ['a@example.com'], notificationEmails: [],
  });
  const res = await request(app).get('/api/auth/app-config').set(admin());
  expect(res.status).toBe(200);
  expect(JSON.stringify(res.body)).not.toMatch(/secrethash/);
  expect(res.body.userPasswordSet).toBe(true);
});
