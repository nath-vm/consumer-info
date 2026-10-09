/**
 * The most important tests in the project: they prove that data endpoints are
 * protected ON THE SERVER, not just hidden in the UI. All models are mocked,
 * so no database is needed.
 */
jest.mock('../models/Consumer', () => ({
  find: jest.fn(), countDocuments: jest.fn(), findById: jest.fn(), findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(), updateMany: jest.fn(), bulkWrite: jest.fn(), insertMany: jest.fn(),
}));
jest.mock('../models/RoverBook', () => ({
  find: jest.fn(), findOne: jest.fn(), findById: jest.fn(), findByIdAndDelete: jest.fn(), create: jest.fn(), bulkWrite: jest.fn(),
}));
jest.mock('../models/AuditLog', () => ({ create: jest.fn().mockResolvedValue({}), find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../models/AdminConfig', () => ({ findOne: jest.fn(), findOneAndUpdate: jest.fn() }));
jest.mock('../models/RefreshToken', () => ({ create: jest.fn(), findOne: jest.fn(), updateOne: jest.fn(), updateMany: jest.fn() }));
jest.mock('@getbrevo/brevo', () => ({ BrevoClient: jest.fn() }));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../app');
const Consumer = require('../models/Consumer');
const RoverBook = require('../models/RoverBook');
const { userToken, adminToken, expiredToken, asCookie, queryChain, sign } = require('./helpers');

const app = createApp();
const VALID_ID = '64b7f0c2a1b2c3d4e5f60718';

beforeEach(() => {
  jest.clearAllMocks();
  Consumer.countDocuments.mockResolvedValue(1);
  Consumer.find.mockReturnValue(queryChain([{ _id: VALID_ID, accountName: 'TEST PERSON', isHidden: false }]));
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('anonymous visitors are rejected by the SERVER', () => {
  const cases = [
    ['GET', '/api/consumers/search'],
    ['GET', `/api/consumers/${VALID_ID}`],
    ['GET', '/api/rover-book/lookup/R1'],
    ['POST', '/api/rover-book/bulk-lookup'],
    ['GET', '/api/rover-book'],
    ['POST', '/api/consumers'],
    ['PUT', '/api/consumers/bulk-hide'],
    ['GET', '/api/auth/audit-log'],
    ['GET', '/api/auth/app-config'],
  ];
  test.each(cases)('%s %s -> 401', async (method, url) => {
    const res = await request(app)[method.toLowerCase()](url).send({});
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_TOKEN');
  });

  test('no database query runs for an anonymous search', async () => {
    await request(app).get('/api/consumers/search');
    expect(Consumer.find).not.toHaveBeenCalled();
    expect(Consumer.countDocuments).not.toHaveBeenCalled();
  });
});

describe('token validation', () => {
  test('expired token -> 401 TOKEN_EXPIRED (frontend uses this to refresh silently)', async () => {
    const res = await request(app).get('/api/consumers/search').set('Cookie', asCookie(expiredToken()));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  test('token signed with the wrong secret -> 401', async () => {
    const forged = jwt.sign({ role: 'admin', sub: 'x', email: 'x@example.com' }, 'some-other-secret-some-other-secret');
    const res = await request(app).get('/api/consumers/search').set('Cookie', asCookie(forged));
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  test('unsigned ("alg: none") token -> 401', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ role: 'admin', email: 'x@example.com' })}.`;
    const res = await request(app).get('/api/consumers/search').set('Cookie', asCookie(none));
    expect(res.status).toBe(401);
  });

  test('token with an unknown role -> 403', async () => {
    const res = await request(app).get('/api/consumers/search').set('Cookie', asCookie(sign({ role: 'guest', sub: 'g' })));
    expect(res.status).toBe(403);
  });

  test('Authorization: Bearer header also works', async () => {
    const res = await request(app).get('/api/consumers/search').set('Authorization', `Bearer ${userToken()}`);
    expect(res.status).toBe(200);
  });
});

describe('shared-password USER role', () => {
  test('can search', async () => {
    const res = await request(app).get('/api/consumers/search?query=test').set('Cookie', asCookie(userToken()));
    expect(res.status).toBe(200);
    expect(res.body.consumers).toHaveLength(1);
  });

  test('can NEVER see hidden consumers, even with includeHidden=true', async () => {
    await request(app).get('/api/consumers/search?includeHidden=true').set('Cookie', asCookie(userToken()));
    expect(Consumer.countDocuments).toHaveBeenCalledWith({ isHidden: { $ne: true } });
  });

  test('page size is capped at 50 and allPages is ignored (anti-scraping)', async () => {
    await request(app).get('/api/consumers/search?limit=500&allPages=true').set('Cookie', asCookie(userToken()));
    const chain = Consumer.find.mock.results[0].value;
    expect(chain.limit).toHaveBeenCalledWith(50);
  });

  test('cannot call rover-book endpoints (admin only)', async () => {
    const res = await request(app).get('/api/rover-book/lookup/R1').set('Cookie', asCookie(userToken()));
    expect(res.status).toBe(403);
    expect(RoverBook.findOne).not.toHaveBeenCalled();
  });

  test.each([
    ['POST', '/api/consumers'],
    ['PUT', `/api/consumers/${VALID_ID}`],
    ['DELETE', `/api/consumers/${VALID_ID}/permanent`],
    ['PUT', '/api/consumers/bulk-hide'],
    ['POST', '/api/consumers/batch-upsert'],
    ['GET', '/api/auth/audit-log'],
    ['POST', '/api/auth/user-password'],
  ])('cannot %s %s (admin only) -> 403', async (method, url) => {
    const res = await request(app)[method.toLowerCase()](url).set('Cookie', asCookie(userToken())).send({});
    expect(res.status).toBe(403);
    expect(Consumer.updateMany).not.toHaveBeenCalled();
    expect(Consumer.findByIdAndDelete).not.toHaveBeenCalled();
  });

  test('a hidden consumer looks like it does not exist (404)', async () => {
    Consumer.findById.mockResolvedValue({ _id: VALID_ID, isHidden: true });
    const res = await request(app).get(`/api/consumers/${VALID_ID}`).set('Cookie', asCookie(userToken()));
    expect(res.status).toBe(404);
  });
});

describe('ADMIN role', () => {
  test('can request hidden consumers', async () => {
    await request(app).get('/api/consumers/search?includeHidden=true').set('Cookie', asCookie(adminToken()));
    expect(Consumer.countDocuments).toHaveBeenCalledWith({ isHidden: true });
  });

  test('can read a hidden consumer', async () => {
    Consumer.findById.mockResolvedValue({ _id: VALID_ID, isHidden: true });
    const res = await request(app).get(`/api/consumers/${VALID_ID}`).set('Cookie', asCookie(adminToken()));
    expect(res.status).toBe(200);
  });

  test('can use the rover-book lookup', async () => {
    RoverBook.findOne.mockReturnValue({ lean: () => Promise.resolve({ roverNumber: 'R1', address: 'X' }) });
    const res = await request(app).get('/api/rover-book/lookup/R1').set('Cookie', asCookie(adminToken()));
    expect(res.status).toBe(200);
  });
});

describe('search input handling', () => {
  const asUser = (url) => request(app).get(url).set('Cookie', asCookie(userToken()));

  test('regex characters are escaped (no regex injection / ReDoS)', async () => {
    await asUser('/api/consumers/search?query=' + encodeURIComponent('.*(a+)+$'));
    const filter = Consumer.countDocuments.mock.calls[0][0];
    const regex = filter.$or[0].sn;
    expect(regex.source).toBe('\\.\\*\\(a\\+\\)\\+\\$');
  });

  test('the "field" dropdown restricts the search to that one field', async () => {
    await asUser('/api/consumers/search?query=abc&field=accountNumber');
    const filter = Consumer.countDocuments.mock.calls[0][0];
    expect(filter.$or).toHaveLength(1);
    expect(Object.keys(filter.$or[0])).toEqual(['accountNumber']);
  });

  test('an unknown "field" falls back to searching all fields (no arbitrary field names)', async () => {
    await asUser('/api/consumers/search?query=abc&field=isHidden');
    const filter = Consumer.countDocuments.mock.calls[0][0];
    expect(filter.$or.length).toBeGreaterThan(1);
  });

  test('array / object query values do not crash the server', async () => {
    const r1 = await asUser('/api/consumers/search?query[]=a&query[]=b');
    const r2 = await asUser('/api/consumers/search?query[$ne]=x');
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(Consumer.countDocuments.mock.calls[0][0].$or).toBeUndefined();
  });

  test('results use a stable sort', async () => {
    await asUser('/api/consumers/search');
    expect(Consumer.find.mock.results[0].value.sort).toHaveBeenCalledWith({ _id: 1 });
  });
});

describe('ObjectId validation on every /:id route', () => {
  const admin = (m, url) => request(app)[m](url).set('Cookie', asCookie(adminToken())).send({});
  test.each([
    ['get', '/api/consumers/not-an-id'],
    ['put', '/api/consumers/not-an-id'],
    ['put', '/api/consumers/not-an-id/hide'],
    ['put', '/api/consumers/not-an-id/unhide'],
    ['delete', '/api/consumers/not-an-id/permanent'],
    ['put', '/api/rover-book/not-an-id'],
    ['delete', '/api/rover-book/not-an-id'],
    ['get', '/api/consumers/123456789012'], // 12 chars: valid for some libraries, still rejected here
  ])('%s %s -> 400', async (method, url) => {
    const res = await admin(method, url);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid ID.');
  });
});

describe('errors never leak internals to the client', () => {
  test('database error text is hidden', async () => {
    Consumer.countDocuments.mockRejectedValue(new Error('connect ECONNREFUSED mongodb://admin:hunter2@cluster0.example.net'));
    const res = await request(app).get('/api/consumers/search').set('Cookie', asCookie(userToken()));
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/mongodb|hunter2|ECONNREFUSED/);
    expect(res.body.message).toBe('Internal server error');
  });

  test('Mongoose validation errors become a generic 400', async () => {
    const err = new Error('Path `accountNumber` is required. (internal detail)');
    err.name = 'ValidationError';
    Consumer.findByIdAndUpdate.mockRejectedValue(err);
    const res = await request(app).put(`/api/consumers/${VALID_ID}`).set('Cookie', asCookie(adminToken())).send({ accountName: 'X' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/internal detail|Path/);
  });

  test('malformed JSON -> 400, not a 500 with a stack trace', async () => {
    const res = await request(app)
      .post('/api/consumers').set('Cookie', asCookie(adminToken()))
      .set('Content-Type', 'application/json').send('{"broken": ');
    expect(res.status).toBe(400);
  });

  test('unknown API routes return JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Not found');
  });
});

describe('request body size limits', () => {
  test('normal routes reject bodies over ~100kb with 413', async () => {
    const big = { accountName: 'A'.repeat(200 * 1024) };
    const res = await request(app).post('/api/consumers').set('Cookie', asCookie(adminToken())).send(big);
    expect(res.status).toBe(413);
  });

  test('auth routes reject bodies over ~10kb with 413', async () => {
    const res = await request(app).post('/api/auth/user-login').send({ password: 'A'.repeat(20 * 1024) });
    expect(res.status).toBe(413);
  });

  test('batch import routes still accept large bodies (~600kb)', async () => {
    Consumer.bulkWrite.mockResolvedValue({ upsertedCount: 3000, modifiedCount: 0 });
    const rows = Array.from({ length: 3000 }, (_, i) => ({ accountNumber: `ACC${i}`, accountName: 'N'.repeat(150) }));
    const res = await request(app).post('/api/consumers/batch-upsert').set('Cookie', asCookie(adminToken())).send(rows);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3000);
  });

  test('anonymous callers are rejected BEFORE the big body is parsed', async () => {
    const rows = Array.from({ length: 3000 }, (_, i) => ({ accountNumber: `ACC${i}`, accountName: 'N'.repeat(150) }));
    const res = await request(app).post('/api/consumers/batch-upsert').send(rows);
    expect(res.status).toBe(401);
  });
});
