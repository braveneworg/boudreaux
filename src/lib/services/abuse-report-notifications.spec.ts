/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
export {};

vi.mock('server-only', () => ({}));

const adminFindManyMock = vi.fn();
const sendEmailMock = vi.fn();
const smsSendMock = vi.fn();
const getSmsServiceMock = vi.fn(() => ({ send: smsSendMock }));

vi.mock('@/lib/repositories/user-repository', () => ({
  UserRepository: { findAdmins: adminFindManyMock },
}));

vi.mock('@/lib/email/send-abuse-report-notification', () => ({
  sendAbuseReportNotificationEmail: sendEmailMock,
}));

vi.mock('@/lib/services/get-sms-service', () => ({
  getSmsService: getSmsServiceMock,
}));

const { dispatchAbuseReportNotifications } = await import('./abuse-report-notifications');

describe('dispatchAbuseReportNotifications', () => {
  beforeEach(() => {
    adminFindManyMock.mockReset();
    sendEmailMock.mockReset();
    smsSendMock.mockReset();
    getSmsServiceMock.mockClear();
  });

  it('does nothing when there are no admins', async () => {
    adminFindManyMock.mockResolvedValue([]);
    await dispatchAbuseReportNotifications({ reportedUsername: 'target' });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(smsSendMock).not.toHaveBeenCalled();
  });

  it('emails every admin', async () => {
    adminFindManyMock.mockResolvedValue([
      {
        id: 'a1',
        email: 'a1@x.com',
        username: 'admin1',
        phone: null,
        allowSmsNotifications: false,
      },
      {
        id: 'a2',
        email: 'a2@x.com',
        username: 'admin2',
        phone: null,
        allowSmsNotifications: false,
      },
    ]);
    sendEmailMock.mockResolvedValue(true);

    await dispatchAbuseReportNotifications({ reportedUsername: 'target' });

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: 'a1@x.com', reportedUsername: 'target' })
    );
  });

  it('skips SMS when the admin has not opted in or has no phone', async () => {
    adminFindManyMock.mockResolvedValue([
      {
        id: 'a1',
        email: 'a1@x.com',
        username: null,
        phone: '+15551234567',
        allowSmsNotifications: false,
      },
      { id: 'a2', email: 'a2@x.com', username: null, phone: null, allowSmsNotifications: true },
    ]);
    sendEmailMock.mockResolvedValue(true);

    await dispatchAbuseReportNotifications({ reportedUsername: 'target' });

    expect(smsSendMock).not.toHaveBeenCalled();
  });

  it('sends SMS to opted-in admins with a phone number, marked transactional', async () => {
    adminFindManyMock.mockResolvedValue([
      {
        id: 'a1',
        email: 'a1@x.com',
        username: 'admin1',
        phone: '+15551234567',
        allowSmsNotifications: true,
      },
    ]);
    sendEmailMock.mockResolvedValue(true);
    smsSendMock.mockResolvedValue({ ok: true, messageId: 'msg-1' });

    await dispatchAbuseReportNotifications({ reportedUsername: 'target' });

    expect(smsSendMock).toHaveBeenCalledWith(
      '+15551234567',
      expect.stringContaining('Abuse report submitted against @target'),
      { transactional: true }
    );
  });

  it('logs and recovers when an SMS send resolves with a non-ok result', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    adminFindManyMock.mockResolvedValue([
      {
        id: 'a1',
        email: 'a1@x.com',
        username: 'admin1',
        phone: '+15551234567',
        allowSmsNotifications: true,
      },
    ]);
    sendEmailMock.mockResolvedValue(true);
    smsSendMock.mockResolvedValue({ ok: false, error: 'rate limited' });

    await dispatchAbuseReportNotifications({ reportedUsername: 'target' });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('SMS failed for admin a1')
    );
    consoleErrorSpy.mockRestore();
  });

  it('does not throw when an SMS send rejects', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    adminFindManyMock.mockResolvedValue([
      {
        id: 'a1',
        email: 'a1@x.com',
        username: 'admin1',
        phone: '+15551234567',
        allowSmsNotifications: true,
      },
    ]);
    sendEmailMock.mockResolvedValue(true);
    smsSendMock.mockRejectedValue(Error('SNS down'));

    await expect(
      dispatchAbuseReportNotifications({ reportedUsername: 'target' })
    ).resolves.toBeUndefined();
    consoleErrorSpy.mockRestore();
  });

  it('does not throw when one admin email send fails', async () => {
    adminFindManyMock.mockResolvedValue([
      { id: 'a1', email: 'a1@x.com', username: null, phone: null, allowSmsNotifications: false },
      { id: 'a2', email: 'a2@x.com', username: null, phone: null, allowSmsNotifications: false },
    ]);
    sendEmailMock.mockImplementationOnce(() => Promise.reject(Error('SES down')));
    sendEmailMock.mockImplementationOnce(() => Promise.resolve(true));

    await expect(
      dispatchAbuseReportNotifications({ reportedUsername: 'target' })
    ).resolves.toBeUndefined();
  });
});
