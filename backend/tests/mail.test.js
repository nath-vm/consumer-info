jest.mock('../models/AdminConfig');
jest.mock('../models/RefreshToken');
jest.mock('../models/AuditLog');

const AdminConfig  = require('../models/AdminConfig');
const RefreshToken = require('../models/RefreshToken');
const AuditLog     = require('../models/AuditLog');
const { sendMail } = require('../utils/mailer');
const { runRotationCheck } = require('../scheduler/passwordRotation');

const okResponse   = () => ({ ok: true, status: 200, json: async () => ({ id: 'email_1' }), text: async () => '' });
const failResponse = (status) => ({ ok: false, status, json: async () => ({}), text: async () => 'nope' });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-key';
  delete process.env.MAIL_FROM;
  global.fetch = jest.fn().mockResolvedValue(okResponse());
  RefreshToken.updateMany.mockResolvedValue({});
  AuditLog.create.mockResolvedValue({});
});

describe('mailer (Resend)', () => {
  test('posts to the Resend API with a bearer token and the default sender', async () => {
    await sendMail({ to: ['a@example.com'], subject: 'Hi', text: 'Body' });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(opts.body);
    expect(body.from).toMatch(/onboarding@resend\.dev/);
    expect(body.to).toEqual(['a@example.com']);
  });

  test('MAIL_FROM overrides the default sender', async () => {
    process.env.MAIL_FROM = 'Alerts <alerts@example.com>';
    await sendMail({ to: 'a@example.com', subject: 'Hi', text: 'Body' });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).from).toBe('Alerts <alerts@example.com>');
  });

  test('throws an error carrying the HTTP status when Resend rejects the email', async () => {
    global.fetch.mockResolvedValue(failResponse(403));
    await expect(sendMail({ to: 'a@example.com', subject: 'x', text: 'y' })).rejects.toMatchObject({ status: 403 });
  });

  test('throws when no API key is configured', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendMail({ to: 'a@example.com', subject: 'x', text: 'y' })).rejects.toThrow(/RESEND_API_KEY/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('automatic password rotation never loses the new password', () => {
  const dueConfig = () => ({
    passwordRotation: 'weekly',
    nextPasswordChange: new Date(Date.now() - 1000),
    notificationEmails: ['admin@example.com'],
    userPassword: 'old-hash',
    save: jest.fn().mockResolvedValue(),
  });

  test('rotates and saves after the email was sent', async () => {
    const cfg = dueConfig();
    AdminConfig.findOne.mockResolvedValue(cfg);
    await runRotationCheck();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(cfg.save).toHaveBeenCalled();
    expect(cfg.userPassword).not.toBe('old-hash');
  });

  test('does not rotate when email is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const cfg = dueConfig();
    AdminConfig.findOne.mockResolvedValue(cfg);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await runRotationCheck();
    expect(cfg.save).not.toHaveBeenCalled();
    expect(cfg.userPassword).toBe('old-hash');
    warn.mockRestore();
  });

  test('does not rotate when the email fails to send', async () => {
    global.fetch.mockResolvedValue(failResponse(500));
    const cfg = dueConfig();
    AdminConfig.findOne.mockResolvedValue(cfg);
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    await runRotationCheck();
    expect(cfg.save).not.toHaveBeenCalled();
    expect(cfg.userPassword).toBe('old-hash');
    err.mockRestore();
  });

  test('does nothing when rotation is manual', async () => {
    const cfg = { ...dueConfig(), passwordRotation: 'manual' };
    AdminConfig.findOne.mockResolvedValue(cfg);
    await runRotationCheck();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
