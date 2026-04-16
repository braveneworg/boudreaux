/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { buildLoginVerificationEmailHtml } from './login-verification-email-html';
import { buildLoginVerificationEmailText } from './login-verification-email-text';
import { sendVerificationRequest } from './send-verification-request';

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

vi.mock('./login-verification-email-html', () => ({
  buildLoginVerificationEmailHtml: vi.fn().mockReturnValue('<html>login</html>'),
}));

vi.mock('./login-verification-email-text', () => ({
  buildLoginVerificationEmailText: vi.fn().mockReturnValue('login text'),
}));

describe('sendVerificationRequest', () => {
  const validParams = {
    identifier: 'fan@example.com',
    url: 'https://example.com/api/auth/callback/email?token=abc123',
    provider: {
      server: {
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'user', pass: 'pass' },
      },
      from: 'noreply@fakefourrecords.com',
    },
  };

  beforeEach(() => {
    vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
    mockFindUnique.mockResolvedValue({ id: 'user-1' });
    mockSendMail.mockResolvedValue({});
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
    vi.mocked(buildLoginVerificationEmailHtml).mockReturnValue('<html>login</html>');
    vi.mocked(buildLoginVerificationEmailText).mockReturnValue('login text');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('EMAIL_FROM guard', () => {
    it('should throw when EMAIL_FROM is not configured and provider.from is absent', async () => {
      vi.stubEnv('EMAIL_FROM', '');
      const params = { ...validParams, provider: { server: validParams.provider.server } };

      await expect(sendVerificationRequest(params)).rejects.toThrow('EMAIL_FROM is not configured');
    });

    it('should use provider.from when set', async () => {
      await sendVerificationRequest(validParams);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'noreply@fakefourrecords.com' })
      );
    });

    it('should fall back to EMAIL_FROM env var when provider.from is absent', async () => {
      vi.stubEnv('EMAIL_FROM', 'env@fakefourrecords.com');
      const params = { ...validParams, provider: { server: validParams.provider.server } };

      await sendVerificationRequest(params);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'env@fakefourrecords.com' })
      );
    });
  });

  describe('new vs returning user detection', () => {
    it('should set isNewUser=true when prisma returns null (user not found)', async () => {
      mockFindUnique.mockResolvedValue(null);

      await sendVerificationRequest(validParams);

      expect(vi.mocked(buildLoginVerificationEmailHtml)).toHaveBeenCalledWith(
        expect.objectContaining({ isNewUser: true })
      );
    });

    it('should set isNewUser=false when prisma returns an existing user', async () => {
      mockFindUnique.mockResolvedValue({ id: 'user-1' });

      await sendVerificationRequest(validParams);

      expect(vi.mocked(buildLoginVerificationEmailHtml)).toHaveBeenCalledWith(
        expect.objectContaining({ isNewUser: false })
      );
    });

    it('should look up the user by email identifier', async () => {
      await sendVerificationRequest(validParams);

      expect(mockFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'fan@example.com' } })
      );
    });

    it('should default to returning-user (isNewUser=false) when the DB lookup throws', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFindUnique.mockRejectedValue(new Error('DB unavailable'));

      await sendVerificationRequest(validParams);

      expect(vi.mocked(buildLoginVerificationEmailHtml)).toHaveBeenCalledWith(
        expect.objectContaining({ isNewUser: false })
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('email send', () => {
    it('should create a nodemailer transport from provider.server', async () => {
      await sendVerificationRequest(validParams);

      expect(mockCreateTransport).toHaveBeenCalledWith(validParams.provider.server);
    });

    it('should send to the identifier address', async () => {
      await sendVerificationRequest(validParams);

      expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'fan@example.com' }));
    });

    it('should include both html and text bodies', async () => {
      await sendVerificationRequest(validParams);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<html>login</html>',
          text: 'login text',
        })
      );
    });

    it('should attach the logo with the expected CID', async () => {
      await sendVerificationRequest(validParams);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({ cid: 'logo@fakefourrecords.com' }),
          ]),
        })
      );
    });

    it('should use a welcome subject for new users', async () => {
      mockFindUnique.mockResolvedValue(null);

      await sendVerificationRequest(validParams);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Welcome to Fake Four Inc.'),
        })
      );
    });

    it('should use a welcome-back subject for returning users', async () => {
      mockFindUnique.mockResolvedValue({ id: 'user-1' });

      await sendVerificationRequest(validParams);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Welcome back'),
        })
      );
    });

    it('should pass the sign-in url and email to the email builders', async () => {
      await sendVerificationRequest(validParams);

      expect(vi.mocked(buildLoginVerificationEmailHtml)).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/api/auth/callback/email?token=abc123',
          email: 'fan@example.com',
        })
      );
      expect(vi.mocked(buildLoginVerificationEmailText)).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/api/auth/callback/email?token=abc123',
          email: 'fan@example.com',
        })
      );
    });
  });

  describe('error handling', () => {
    it('should re-throw when sendMail fails', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP failure'));

      await expect(sendVerificationRequest(validParams)).rejects.toThrow('SMTP failure');
    });
  });
});
