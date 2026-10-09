jest.mock('../models/AdminConfig', () => ({ findOne: jest.fn() }));
jest.mock('../models/RefreshToken', () => ({ updateMany: jest.fn().mockResolvedValue({}) }));
jest.mock('../models/AuditLog', () => ({ create: jest.fn().mockResolvedValue({}) }));
const mockSend = jest.fn().mockResolvedValue({});
jest.mock('@getbrevo/brevo', () => ({ BrevoClient: jest.fn(() => ({ transactionalEmails: { sendTransacEmail: mockSend } })) }));

const bcrypt = require('bcryptjs');
const AdminConfig = require('../models/AdminConfig');
const RefreshToken = require('../models/RefreshToken');
const AuditLog = require('../models/AuditLog');
const { runRotationCheck, generatePassword } = require('../scheduler/passwordRotation');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const makeConfig = (over = {}) => ({
  passwordRotation: 'weekly',
  userPassword: 'old-hash',
  nextPasswordChange: new Date(Date.now() - 1000),
  notificationEmails: [],
  save: jest.fn().mockResolvedValue(),
  ...over,
});

describe('generatePassword', () => {
  test('has the requested length and only unambiguous characters', () => {
    const pwd = generatePassword(16);
    expect(pwd).toHaveLength(16);
    expect(pwd).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789]+$/); // no 0/O/1/l/I
  });
  test('two calls differ', () => expect(generatePassword()).not.toBe(generatePassword()));
});

describe('runRotationCheck', () => {
  test('rotates when due: new bcrypt hash, next date set, user sessions revoked, audit entry written', async () => {
    const cfg = makeConfig();
    AdminConfig.findOne.mockResolvedValue(cfg);
    await runRotationCheck();
    expect(cfg.save).toHaveBeenCalled();
    expect(cfg.userPassword).not.toBe('old-hash');
    expect(bcrypt.getRounds(cfg.userPassword)).toBe(10);
    expect(cfg.nextPasswordChange.getTime()).toBeGreaterThan(Date.now());
    expect(RefreshToken.updateMany).toHaveBeenCalledWith({ role: 'user', revoked: false }, { revoked: true });
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_PASSWORD_AUTO_ROTATED', actor: 'system' }));
  });

  test('does nothing before the due date', async () => {
    const cfg = makeConfig({ nextPasswordChange: new Date(Date.now() + 3600_000) });
    AdminConfig.findOne.mockResolvedValue(cfg);
    await runRotationCheck();
    expect(cfg.save).not.toHaveBeenCalled();
    expect(RefreshToken.updateMany).not.toHaveBeenCalled();
  });

  test('does nothing in manual mode', async () => {
    const cfg = makeConfig({ passwordRotation: 'manual', nextPasswordChange: null });
    AdminConfig.findOne.mockResolvedValue(cfg);
    await runRotationCheck();
    expect(cfg.save).not.toHaveBeenCalled();
  });

  test('a database error is swallowed and logged, never thrown (would crash the process)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    AdminConfig.findOne.mockRejectedValue(new Error('db down'));
    await expect(runRotationCheck()).resolves.toBeUndefined();
  });
});
