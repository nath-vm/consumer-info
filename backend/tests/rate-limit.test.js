/** The strict limiter must actually block brute-forcing of the admin login. */
jest.mock('../models/Consumer', () => ({}));
jest.mock('../models/RoverBook', () => ({}));
jest.mock('../models/AuditLog', () => ({ create: jest.fn().mockResolvedValue({}), find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../models/AdminConfig', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../models/RefreshToken', () => ({ create: jest.fn().mockResolvedValue({}), findOne: jest.fn(), updateOne: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}) }));
jest.mock('@getbrevo/brevo', () => ({ BrevoClient: jest.fn() }));

const request = require('supertest');
const createApp = require('../app');
const app = createApp();

test('admin-login is limited to 5 attempts, then 429', async () => {
  const statuses = [];
  for (let i = 0; i < 7; i++) {
    const res = await request(app).post('/api/auth/admin-login').send({});
    statuses.push(res.status);
  }
  expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
  expect(statuses.slice(5)).toEqual([429, 429]);
});

test('health check is never rate limited', async () => {
  for (let i = 0; i < 30; i++) {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  }
});
