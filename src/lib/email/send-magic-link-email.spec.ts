/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { loggers } from '@/lib/utils/logger';

import { buildLoginVerificationEmailHtml } from './login-verification-email-html';
import { buildLoginVerificationEmailText } from './login-verification-email-text';
import { sendMagicLinkEmail } from './send-magic-link-email';

vi.mock('server-only', () => ({}));

const mockFindUnique = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
  },
}));

const mockSendMail = vi.hoisted(() => vi.fn());
const mockCreateTransport = vi.hoisted(() => vi.fn());

vi.mock('nodemailer', () => ({
  default: {
    createTransport: mockCreateTransport,
  },
}));

const mockSesClientSend = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/ses-client', () => ({
  sesClient: { send: mockSesClientSend },
}));

const mockSendRawEmailParams = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-ses', () => ({
  SendRawEmailCommand: class MockSendRawEmailCommand {
    input: unknown;
    constructor(params: unknown) {
      mockSendRawEmailParams(params);
      this.input = params;
    }
  },
}));

const limiterCheckMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/rate-limit', () => ({
  rateLimit: () => ({ check: limiterCheckMock }),
}));

vi.mock('./login-verification-email-html', () => ({
  buildLoginVerificationEmailHtml: vi.fn().mockReturnValue('<html>login</html>'),
}));

vi.mock('./login-verification-email-text', () => ({
  buildLoginVerificationEmailText: vi.fn().mockReturnValue('login text'),
}));

describe('sendMagicLinkEmail', () => {
  const validInput = {
    email: 'fan@example.com',
    url: 'https://example.com/api/auth/magic-link/verify?token=abc123',
  };

  beforeEach(() => {
    vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
    mockFindUnique.mockResolvedValue({ id: 'user-1' });
    mockSendMail.mockResolvedValue({ message: Buffer.from('raw-mime-message') });
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
    mockSesClientSend.mockResolvedValue({});
    limiterCheckMock.mockResolvedValue(undefined);
    vi.mocked(buildLoginVerificationEmailHtml).mockReturnValue('<html>login</html>');
    vi.mocked(buildLoginVerificationEmailText).mockReturnValue('login text');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('per-recipient rate limit', () => {
    it('throws and does not send when the recipient is over the limit', async () => {
      limiterCheckMock.mockRejectedValue(new Error('rate limited'));

      await expect(sendMagicLinkEmail(validInput)).rejects.toThrow(
        'Too many sign-in emails requested. Please try again later.'
      );
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('keys the limit on the lowercased recipient address', async () => {
      await sendMagicLinkEmail({ ...validInput, email: 'Fan@Example.COM' });

      expect(limiterCheckMock).toHaveBeenCalledWith(5, 'fan@example.com');
    });

    it('skips the limiter in E2E mode', async () => {
      vi.stubEnv('E2E_MODE', 'true');
      limiterCheckMock.mockRejectedValue(new Error('rate limited'));

      await sendMagicLinkEmail(validInput);

      expect(limiterCheckMock).not.toHaveBeenCalled();
    });
  });

  describe('E2E mode', () => {
    it('skips the email send entirely so the success redirect is exercised', async () => {
      vi.stubEnv('E2E_MODE', 'true');

      await sendMagicLinkEmail(validInput);

      expect(mockSendMail).not.toHaveBeenCalled();
      expect(mockSesClientSend).not.toHaveBeenCalled();
    });

    it('does not throw when EMAIL_FROM is unset (no email config in CI)', async () => {
      vi.stubEnv('E2E_MODE', 'true');
      vi.stubEnv('EMAIL_FROM', '');

      await expect(sendMagicLinkEmail(validInput)).resolves.toBeUndefined();
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  describe('EMAIL_FROM guard', () => {
    it('throws when EMAIL_FROM is not configured', async () => {
      vi.stubEnv('EMAIL_FROM', '');

      await expect(sendMagicLinkEmail(validInput)).rejects.toThrow('EMAIL_FROM is not configured');
    });

    it('sends from the EMAIL_FROM env var', async () => {
      vi.stubEnv('EMAIL_FROM', 'env@fakefourrecords.com');

      await sendMagicLinkEmail(validInput);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'env@fakefourrecords.com' })
      );
    });
  });

  describe('new vs returning user detection', () => {
    it('sets isNewUser=true when prisma returns null (user not found)', async () => {
      mockFindUnique.mockResolvedValue(null);

      await sendMagicLinkEmail(validInput);

      expect(vi.mocked(buildLoginVerificationEmailHtml)).toHaveBeenCalledWith(
        expect.objectContaining({ isNewUser: true })
      );
    });

    it('sets isNewUser=false when prisma returns an existing user', async () => {
      mockFindUnique.mockResolvedValue({ id: 'user-1' });

      await sendMagicLinkEmail(validInput);

      expect(vi.mocked(buildLoginVerificationEmailHtml)).toHaveBeenCalledWith(
        expect.objectContaining({ isNewUser: false })
      );
    });

    it('looks up the user by email', async () => {
      await sendMagicLinkEmail(validInput);

      expect(mockFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'fan@example.com' } })
      );
    });

    it('defaults to returning-user (isNewUser=false) when the DB lookup throws', async () => {
      const loggerErrorSpy = vi.spyOn(loggers.auth, 'error').mockImplementation(() => {});
      mockFindUnique.mockRejectedValue(new Error('DB unavailable'));

      await sendMagicLinkEmail(validInput);

      expect(vi.mocked(buildLoginVerificationEmailHtml)).toHaveBeenCalledWith(
        expect.objectContaining({ isNewUser: false })
      );
      loggerErrorSpy.mockRestore();
    });
  });

  describe('email send', () => {
    it('builds the MIME message with an in-memory stream transport (no SMTP connection)', async () => {
      await sendMagicLinkEmail(validInput);

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({ streamTransport: true, buffer: true })
      );
    });

    it('delivers the raw message through the SES client (not SMTP)', async () => {
      await sendMagicLinkEmail(validInput);

      expect(mockSesClientSend).toHaveBeenCalledTimes(1);
    });

    it('sends the built raw MIME to the recipient via SES', async () => {
      await sendMagicLinkEmail(validInput);

      expect(mockSendRawEmailParams).toHaveBeenCalledWith(
        expect.objectContaining({
          Source: 'noreply@fakefourrecords.com',
          Destinations: ['fan@example.com'],
          RawMessage: { Data: expect.any(Buffer) },
        })
      );
    });

    it('addresses the MIME message to the recipient', async () => {
      await sendMagicLinkEmail(validInput);

      expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'fan@example.com' }));
    });

    it('includes both html and text bodies', async () => {
      await sendMagicLinkEmail(validInput);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<html>login</html>',
          text: 'login text',
        })
      );
    });

    it('attaches the logo with the expected CID', async () => {
      await sendMagicLinkEmail(validInput);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({ cid: 'logo@fakefourrecords.com' }),
          ]),
        })
      );
    });

    it('uses a welcome subject for new users', async () => {
      mockFindUnique.mockResolvedValue(null);

      await sendMagicLinkEmail(validInput);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Welcome to Fake Four Inc.'),
        })
      );
    });

    it('uses a welcome-back subject for returning users', async () => {
      mockFindUnique.mockResolvedValue({ id: 'user-1' });

      await sendMagicLinkEmail(validInput);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Welcome back'),
        })
      );
    });

    it('passes the sign-in url and email to the email builders', async () => {
      await sendMagicLinkEmail(validInput);

      expect(vi.mocked(buildLoginVerificationEmailHtml)).toHaveBeenCalledWith(
        expect.objectContaining({
          url: validInput.url,
          email: 'fan@example.com',
        })
      );
      expect(vi.mocked(buildLoginVerificationEmailText)).toHaveBeenCalledWith(
        expect.objectContaining({
          url: validInput.url,
          email: 'fan@example.com',
        })
      );
    });
  });

  describe('error handling', () => {
    it('re-throws when the MIME build fails', async () => {
      mockSendMail.mockRejectedValue(new Error('mime build failure'));

      await expect(sendMagicLinkEmail(validInput)).rejects.toThrow('mime build failure');
    });

    it('re-throws when the SES send fails', async () => {
      mockSesClientSend.mockRejectedValue(new Error('SES failure'));

      await expect(sendMagicLinkEmail(validInput)).rejects.toThrow('SES failure');
    });
  });
});
