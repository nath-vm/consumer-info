const { sanitizeConsumer, normalizeAccountNumber, MAX_FIELD_LENGTH } = require('../utils/sanitizeConsumer');
const escapeRegex = require('../utils/escapeRegex');
const validateObjectId = require('../utils/validateObjectId');
const { calcNextRotation } = require('../utils/rotationUtils');
const { validateEnv } = require('../config/env');

describe('sanitizeConsumer', () => {
  test('keeps only whitelisted fields', () => {
    const out = sanitizeConsumer({ accountName: 'A', role: 'admin', __proto__x: 1, $where: '1' });
    expect(out).toEqual({ accountName: 'A' });
  });

  test('drops objects/arrays (blocks NoSQL operator objects), keeps strings', () => {
    const out = sanitizeConsumer({ accountName: { $gt: '' }, address: ['a'], status: null, sn: 'ok' });
    expect(out).toEqual({ sn: 'ok' });
  });

  test('trims and caps text at the maximum length', () => {
    const out = sanitizeConsumer({ address: `  ${'x'.repeat(500)}  ` });
    expect(out.address).toHaveLength(MAX_FIELD_LENGTH);
  });

  test('numbers become strings', () => {
    expect(sanitizeConsumer({ poleNumber: 42 })).toEqual({ poleNumber: '42' });
    expect(sanitizeConsumer({ poleNumber: Infinity })).toEqual({});
  });

  test('isHidden must be a real boolean', () => {
    expect(sanitizeConsumer({ isHidden: true })).toEqual({ isHidden: true });
    expect(sanitizeConsumer({ isHidden: 'true' })).toEqual({});
    expect(sanitizeConsumer({ isHidden: 1 })).toEqual({});
  });

  test('account numbers are normalised the same way on every write', () => {
    expect(sanitizeConsumer({ accountNumber: ' 050 110 90 ' }).accountNumber).toBe('05011090');
    expect(normalizeAccountNumber('ab 12')).toBe('AB12');
  });

  test('null / non-object input yields an empty object', () => {
    expect(sanitizeConsumer(null)).toEqual({});
    expect(sanitizeConsumer('text')).toEqual({});
    expect(sanitizeConsumer(undefined)).toEqual({});
  });
});

describe('escapeRegex', () => {
  test('escapes every metacharacter so input matches literally', () => {
    const input = '.*+?^${}()|[]\\';
    expect(new RegExp(escapeRegex(input)).test(input)).toBe(true);
    expect(new RegExp(escapeRegex('a.c')).test('abc')).toBe(false);
  });
});

describe('validateObjectId', () => {
  const run = (value) => {
    const res = { status: jest.fn(() => res), json: jest.fn() };
    const next = jest.fn();
    validateObjectId({}, res, next, value);
    return { res, next };
  };
  test('accepts a 24-hex id', () => expect(run('64b7f0c2a1b2c3d4e5f60718').next).toHaveBeenCalled());
  test.each(['', 'abc', '123456789012', '64b7f0c2a1b2c3d4e5f6071z', null, undefined, {}])('rejects %p', (v) => {
    const { res, next } = run(v);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('calcNextRotation', () => {
  const days = (d) => d * 24 * 60 * 60 * 1000;
  test('manual -> null', () => expect(calcNextRotation('manual')).toBeNull());
  test('unknown value -> null', () => expect(calcNextRotation('hourly')).toBeNull());
  test.each([['daily', 1], ['weekly', 7], ['monthly', 30]])('%s -> about %i day(s) ahead', (name, d) => {
    const diff = calcNextRotation(name).getTime() - Date.now();
    expect(Math.abs(diff - days(d))).toBeLessThan(5000);
  });
});

describe('validateEnv (fail-fast startup check)', () => {
  const good = { JWT_SECRET: 'x'.repeat(40), MONGO_URI: 'mongodb://h/db', GOOGLE_CLIENT_ID: 'id' };
  test('passes with everything set', () => expect(validateEnv(good)).toBe(true));
  test('names every missing variable', () => {
    expect(() => validateEnv({})).toThrow(/JWT_SECRET.*MONGO_URI.*GOOGLE_CLIENT_ID/);
  });
  test('treats a blank value as missing', () => {
    expect(() => validateEnv({ ...good, MONGO_URI: '   ' })).toThrow(/MONGO_URI/);
  });
  test('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...good, JWT_SECRET: 'short' })).toThrow(/at least 32/);
  });
});
