/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildPurchaseConfirmationEmailHtml } from './purchase-confirmation-email-html';
import { buildPurchaseConfirmationEmailText } from './purchase-confirmation-email-text';
import { sendPurchaseConfirmationEmail } from './send-purchase-confirmation';

vi.mock('server-only', () => ({}));

const mockMarkEmailSent = vi.hoisted(() => vi.fn());

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    markEmailSent: mockMarkEmailSent,
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

const mockSendEmailParams = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-ses', () => ({
  SendEmailCommand: class MockSendEmailCommand {
    input: unknown;
    constructor(params: unknown) {
      mockSendEmailParams(params);
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
    mockSesClientSend.mockResolvedValue({});
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

      const result = await sendPurchaseConfirmationEmail(validInput);

      expect(result).toBe(false);
      expect(mockSesClientSend).not.toHaveBeenCalled();
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

    it('should use EMAIL_FROM as the Source address', async () => {
      await sendPurchaseConfirmationEmail(validInput);

      expect(mockSendEmailParams).toHaveBeenCalledWith(
        expect.objectContaining({
          Source: 'noreply@fakefourrecords.com',
        })
      );
    });

    it('should send to the customerEmail as the sole ToAddress', async () => {
      await sendPurchaseConfirmationEmail(validInput);

      expect(mockSendEmailParams).toHaveBeenCalledWith(
        expect.objectContaining({
          Destination: { ToAddresses: ['buyer@example.com'] },
        })
      );
    });

    it('should include the release title in the email subject', async () => {
      await sendPurchaseConfirmationEmail(validInput);

      expect(mockSendEmailParams).toHaveBeenCalledWith(
        expect.objectContaining({
          Message: expect.objectContaining({
            Subject: expect.objectContaining({
              Data: expect.stringContaining('Test Album'),
            }),
          }),
        })
      );
    });

    it('should include both HTML and text bodies in the email message', async () => {
      await sendPurchaseConfirmationEmail(validInput);

      expect(mockSendEmailParams).toHaveBeenCalledWith(
        expect.objectContaining({
          Message: expect.objectContaining({
            Body: expect.objectContaining({
              Html: expect.objectContaining({ Data: '<html>test</html>' }),
              Text: expect.objectContaining({ Data: 'test text' }),
            }),
          }),
        })
      );
    });

    it('should build the downloadUrl from NEXT_PUBLIC_BASE_URL and releaseId', async () => {
      await sendPurchaseConfirmationEmail(validInput);

      expect(vi.mocked(buildPurchaseConfirmationEmailHtml)).toHaveBeenCalledWith(
        expect.objectContaining({
          downloadUrl: 'https://example.com/api/releases/release-abc/download',
        })
      );
    });

    it('should fall back to default base URL when NEXT_PUBLIC_BASE_URL is not set', async () => {
      delete process.env.NEXT_PUBLIC_BASE_URL;

      await sendPurchaseConfirmationEmail(validInput);

      expect(vi.mocked(buildPurchaseConfirmationEmailHtml)).toHaveBeenCalledWith(
        expect.objectContaining({
          downloadUrl: 'https://fakefourrecords.com/api/releases/release-abc/download',
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
  });
});
