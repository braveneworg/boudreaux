/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { buildPurchaseConfirmationEmailHtml } from './purchase-confirmation-email-html';
import { buildPurchaseConfirmationEmailText } from './purchase-confirmation-email-text';
import { sendPurchaseConfirmationEmail } from './send-purchase-confirmation';

vi.mock('server-only', () => ({}));

const mockMarkEmailSent = vi.hoisted(() => vi.fn());
const mockResetEmailSent = vi.hoisted(() => vi.fn());

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    markEmailSent: mockMarkEmailSent,
    resetEmailSent: mockResetEmailSent,
  },
}));

const mockSesClientSend = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/ses-client', () => ({
  sesClient: { send: mockSesClientSend },
}));

vi.mock('./purchase-confirmation-email-html', () => ({
  buildPurchaseConfirmationEmailHtml: vi.fn().mockReturnValue('<html>test</html>'),
}));

vi.mock('./purchase-confirmation-email-text', () => ({
  buildPurchaseConfirmationEmailText: vi.fn().mockReturnValue('test text'),
}));

const mockSendMail = vi.hoisted(() => vi.fn());
const mockCreateTransport = vi.hoisted(() => vi.fn());

vi.mock('nodemailer', () => ({
  default: {
    createTransport: mockCreateTransport,
  },
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

describe('sendPurchaseConfirmationEmail', () => {
  const validInput = {
    purchaseId: 'purchase-1',
    customerEmail: 'buyer@example.com',
    releaseTitle: 'Test Album',
    amountPaidCents: 500,
    releaseId: 'release-abc',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://example.com');
    mockMarkEmailSent.mockResolvedValue(true);
    mockResetEmailSent.mockResolvedValue(undefined);
    mockSesClientSend.mockResolvedValue({});
    mockSendMail.mockResolvedValue({ message: Buffer.from('raw-mime-message') });
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
    vi.mocked(buildPurchaseConfirmationEmailHtml).mockReturnValue('<html>test</html>');
    vi.mocked(buildPurchaseConfirmationEmailText).mockReturnValue('test text');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('EMAIL_FROM guard', () => {
    it('should not call sesClient.send and should return false when EMAIL_FROM is not set', async () => {
      vi.stubEnv('EMAIL_FROM', '');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await sendPurchaseConfirmationEmail(validInput);

      expect(result).toBe(false);
      expect(mockMarkEmailSent).not.toHaveBeenCalled();
      expect(mockSesClientSend).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('markEmailSent deduplication', () => {
    it('should not call sesClient.send and return false when markEmailSent returns false (email already sent)', async () => {
      mockMarkEmailSent.mockResolvedValue(false);
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await sendPurchaseConfirmationEmail(validInput);

      expect(result).toBe(false);
      expect(mockSesClientSend).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipped: confirmationEmailSentAt already set')
      );
      consoleWarnSpy.mockRestore();
    });

    it('should call markEmailSent with the purchaseId before sending', async () => {
      await sendPurchaseConfirmationEmail(validInput);

      expect(mockMarkEmailSent).toHaveBeenCalledWith('purchase-1');
    });
  });

  describe('successful email send', () => {
    it('should call sesClient.send and return true when markEmailSent returns true', async () => {
      const result = await sendPurchaseConfirmationEmail(validInput);

      expect(result).toBe(true);
      expect(mockSesClientSend).toHaveBeenCalledTimes(1);
    });

    it('should use EMAIL_FROM as the Source address in the raw email command', async () => {
      await sendPurchaseConfirmationEmail(validInput);

      expect(mockSendRawEmailParams).toHaveBeenCalledWith(
        expect.objectContaining({
          Source: 'noreply@fakefourrecords.com',
        })
      );
    });

    it('should send to the customerEmail as the sole Destination', async () => {
      await sendPurchaseConfirmationEmail(validInput);

      expect(mockSendRawEmailParams).toHaveBeenCalledWith(
        expect.objectContaining({
          Destinations: ['buyer@example.com'],
        })
      );
    });

    it('should include the release title in the email subject', async () => {
      await sendPurchaseConfirmationEmail(validInput);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('Test Album'),
        })
      );
    });

    it('should include both HTML and text bodies in the email', async () => {
      await sendPurchaseConfirmationEmail(validInput);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<html>test</html>',
          text: 'test text',
        })
      );
    });

    it('should attach the logo with the expected CID', async () => {
      await sendPurchaseConfirmationEmail(validInput);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({ cid: 'logo@fakefourrecords.com' }),
          ]),
        })
      );
    });

    it('should build the downloadUrl from NEXT_PUBLIC_BASE_URL and releaseId pointing to the release page', async () => {
      await sendPurchaseConfirmationEmail(validInput);

      expect(vi.mocked(buildPurchaseConfirmationEmailHtml)).toHaveBeenCalledWith(
        expect.objectContaining({
          downloadUrl: 'https://example.com/releases/release-abc',
        })
      );
    });

    it('should format amountPaidCents as a dollar string for the email builders', async () => {
      await sendPurchaseConfirmationEmail(validInput);

      expect(vi.mocked(buildPurchaseConfirmationEmailHtml)).toHaveBeenCalledWith(
        expect.objectContaining({
          amountPaid: '$5.00',
        })
      );
      expect(vi.mocked(buildPurchaseConfirmationEmailText)).toHaveBeenCalledWith(
        expect.objectContaining({
          amountPaid: '$5.00',
        })
      );
    });
  });

  describe('error handling', () => {
    it('should catch a sesClient.send error, not re-throw it, and return false', async () => {
      mockSesClientSend.mockRejectedValue(new Error('SES network failure'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await sendPurchaseConfirmationEmail(validInput);

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should reset the email sent flag when sesClient.send fails so retries can succeed', async () => {
      mockSesClientSend.mockRejectedValue(new Error('SES temporary failure'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await sendPurchaseConfirmationEmail(validInput);

      expect(mockResetEmailSent).toHaveBeenCalledWith('purchase-1');
      consoleErrorSpy.mockRestore();
    });

    it('should not reset the email sent flag when sesClient.send succeeds', async () => {
      await sendPurchaseConfirmationEmail(validInput);

      expect(mockResetEmailSent).not.toHaveBeenCalled();
    });
  });
});
