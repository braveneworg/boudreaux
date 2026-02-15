/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { contactAction } from '@/lib/actions/contact-action';

// Hoisted mocks
const mockGetActionState = vi.hoisted(() => vi.fn());
const mockSetUnknownError = vi.hoisted(() => vi.fn());
const mockVerifyTurnstile = vi.hoisted(() => vi.fn());
const mockSend = vi.hoisted(() => vi.fn());
const mockBuildHtml = vi.hoisted(() => vi.fn().mockReturnValue('<html>email</html>'));
const mockBuildText = vi.hoisted(() => vi.fn().mockReturnValue('email text'));
const mockHeaders = vi.hoisted(() =>
  vi.fn(() => ({
    get: vi.fn((name: string): string | null => {
      if (name === 'x-forwarded-for') return '192.168.1.1';
      return null;
    }),
  }))
);
const mockRateLimitCheck = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('server-only', () => ({}));

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

vi.mock('@/lib/utils/rate-limit', () => ({
  rateLimit: vi.fn(() => ({
    check: mockRateLimitCheck,
  })),
}));

vi.mock('@/lib/utils/verify-turnstile', () => ({
  verifyTurnstile: mockVerifyTurnstile,
}));

vi.mock('@/lib/utils/auth/get-action-state', () => ({
  getActionState: mockGetActionState,
}));

vi.mock('@/lib/utils/auth/auth-utils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    setUnknownError: mockSetUnknownError,
  };
});

vi.mock('@/lib/email/contact-email-html', () => ({
  buildContactEmailHtml: mockBuildHtml,
}));

vi.mock('@/lib/email/contact-email-text', () => ({
  buildContactEmailText: mockBuildText,
}));

vi.mock('@/lib/utils/ses-client', () => ({
  sesClient: { send: mockSend },
}));

// Track the params passed to SendEmailCommand constructor
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

vi.mock('@/lib/validation/contact-schema', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return actual;
});

type FormState = {
  fields: Record<string, string>;
  success: boolean;
  errors?: Record<string, string[]>;
};

describe('contactAction', () => {
  const mockInitialState: FormState = {
    errors: {},
    fields: {},
    success: false,
  };

  const validFormData = () => {
    const fd = new FormData();
    fd.set('reason', 'question');
    fd.set('firstName', 'Jane');
    fd.set('lastName', 'Doe');
    fd.set('email', 'jane@example.com');
    fd.set('phone', '+1 555-123-4567');
    fd.set('message', 'I have a question about your releases.');
    fd.set('cf-turnstile-response', 'test-turnstile-token');
    return fd;
  };

  const validParsedData = {
    reason: 'question',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    phone: '+1 555-123-4567',
    message: 'I have a question about your releases.',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('EMAIL_FROM', 'noreply@fakefourrecords.com');
    vi.stubEnv('CONTACT_EMAIL', 'contact@fakefourrecords.com');
    mockVerifyTurnstile.mockResolvedValue({ success: true });
    mockSend.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('rate limiting', () => {
    it('should return error when rate limit is exceeded', async () => {
      mockRateLimitCheck.mockRejectedValueOnce(new Error('Rate limit exceeded'));

      const result = await contactAction(mockInitialState, validFormData());

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain('Too many submissions. Please try again later.');
    });

    it('should use IP address for rate limiting', async () => {
      mockGetActionState.mockReturnValue({
        formState: { fields: {}, success: false, errors: {} },
        parsed: { success: true, data: validParsedData },
      });

      await contactAction(mockInitialState, validFormData());

      expect(mockRateLimitCheck).toHaveBeenCalledWith(3, '192.168.1.1');
    });

    it('should fall back to x-real-ip when x-forwarded-for is absent', async () => {
      mockHeaders.mockReturnValueOnce({
        get: vi.fn((name: string) => {
          if (name === 'x-real-ip') return '10.0.0.1';
          return null;
        }),
      });

      mockGetActionState.mockReturnValue({
        formState: { fields: {}, success: false, errors: {} },
        parsed: { success: true, data: validParsedData },
      });

      await contactAction(mockInitialState, validFormData());

      expect(mockRateLimitCheck).toHaveBeenCalledWith(3, '10.0.0.1');
    });

    it('should fall back to "anonymous" when no IP headers exist', async () => {
      mockHeaders.mockReturnValueOnce({
        get: vi.fn(() => null),
      });

      mockGetActionState.mockReturnValue({
        formState: { fields: {}, success: false, errors: {} },
        parsed: { success: true, data: validParsedData },
      });

      await contactAction(mockInitialState, validFormData());

      expect(mockRateLimitCheck).toHaveBeenCalledWith(3, 'anonymous');
    });
  });

  describe('Turnstile verification', () => {
    it('should return error when Turnstile token is missing', async () => {
      const fd = validFormData();
      fd.delete('cf-turnstile-response');

      const result = await contactAction(mockInitialState, fd);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain(
        'CAPTCHA verification required. Please complete the verification.'
      );
    });

    it('should return error when Turnstile verification fails', async () => {
      mockVerifyTurnstile.mockResolvedValueOnce({
        success: false,
        error: 'Invalid token',
      });

      const result = await contactAction(mockInitialState, validFormData());

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain('Invalid token');
    });

    it('should return fallback error message when Turnstile fails without custom error', async () => {
      mockVerifyTurnstile.mockResolvedValueOnce({
        success: false,
      });

      const result = await contactAction(mockInitialState, validFormData());

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain('CAPTCHA verification failed. Please try again.');
    });

    it('should call verifyTurnstile with token and IP', async () => {
      mockGetActionState.mockReturnValue({
        formState: { fields: {}, success: false, errors: {} },
        parsed: { success: true, data: validParsedData },
      });

      await contactAction(mockInitialState, validFormData());

      expect(mockVerifyTurnstile).toHaveBeenCalledWith('test-turnstile-token', '192.168.1.1');
    });
  });

  describe('validation', () => {
    it('should return form state with errors when validation fails', async () => {
      const mockFormState = {
        fields: { reason: '', firstName: '' },
        success: false,
        errors: {},
      };

      mockGetActionState.mockReturnValue({
        formState: mockFormState,
        parsed: {
          success: false,
          error: {
            issues: [
              { path: ['reason'], message: 'Please select a reason for contacting us' },
              { path: ['firstName'], message: 'First name is required' },
            ],
          },
        },
      });

      const result = await contactAction(mockInitialState, validFormData());

      expect(result.success).toBe(false);
      expect(result.errors?.reason).toContain('Please select a reason for contacting us');
      expect(result.errors?.firstName).toContain('First name is required');
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should initialize formState.errors when undefined', async () => {
      mockGetActionState.mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: false,
          error: {
            issues: [{ path: ['reason'], message: 'Required' }],
          },
        },
      });

      const result = await contactAction(mockInitialState, validFormData());

      expect(result.errors?.reason).toContain('Required');
    });

    it('should append to existing field error array', async () => {
      mockGetActionState.mockReturnValue({
        formState: {
          fields: {},
          success: false,
          errors: { reason: ['First error'] },
        },
        parsed: {
          success: false,
          error: {
            issues: [{ path: ['reason'], message: 'Second error' }],
          },
        },
      });

      const result = await contactAction(mockInitialState, validFormData());

      expect(result.errors?.reason).toContain('First error');
      expect(result.errors?.reason).toContain('Second error');
    });

    it('should return formState when parsed fails without error object', async () => {
      const mockFormState = {
        fields: {},
        success: false,
        errors: {},
      };

      mockGetActionState.mockReturnValue({
        formState: mockFormState,
        parsed: { success: false },
      });

      const result = await contactAction(mockInitialState, validFormData());

      expect(result.success).toBe(false);
      expect(result.errors).toEqual({});
    });

    it('should map issues without path to "general" error', async () => {
      const mockFormState = {
        fields: {},
        success: false,
        errors: {},
      };

      mockGetActionState.mockReturnValue({
        formState: mockFormState,
        parsed: {
          success: false,
          error: {
            issues: [{ path: [], message: 'Form is invalid' }],
          },
        },
      });

      const result = await contactAction(mockInitialState, validFormData());

      expect(result.errors?.general).toContain('Form is invalid');
    });

    it('should call getActionState with correct permitted fields', async () => {
      mockGetActionState.mockReturnValue({
        formState: { fields: {}, success: false, errors: {} },
        parsed: { success: true, data: validParsedData },
      });

      const fd = validFormData();
      await contactAction(mockInitialState, fd);

      expect(mockGetActionState).toHaveBeenCalledWith(
        fd,
        ['reason', 'firstName', 'lastName', 'email', 'phone', 'message'],
        expect.objectContaining({})
      );
    });
  });

  describe('successful email send', () => {
    beforeEach(() => {
      mockGetActionState.mockReturnValue({
        formState: { fields: {}, success: false, errors: {} },
        parsed: { success: true, data: validParsedData },
      });
    });

    it('should send email and return success', async () => {
      const result = await contactAction(mockInitialState, validFormData());

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should build both HTML and text email bodies', async () => {
      await contactAction(mockInitialState, validFormData());

      expect(mockBuildHtml).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Question',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          message: 'I have a question about your releases.',
        })
      );
      expect(mockBuildText).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Question',
          firstName: 'Jane',
          lastName: 'Doe',
        })
      );
    });

    it('should use CONTACT_EMAIL as destination when set', async () => {
      await contactAction(mockInitialState, validFormData());

      expect(mockSendEmailParams).toHaveBeenCalledWith(
        expect.objectContaining({
          Destination: { ToAddresses: ['contact@fakefourrecords.com'] },
        })
      );
    });

    it('should fall back to EMAIL_FROM when CONTACT_EMAIL is not set', async () => {
      vi.stubEnv('CONTACT_EMAIL', '');

      await contactAction(mockInitialState, validFormData());

      expect(mockSendEmailParams).toHaveBeenCalledWith(
        expect.objectContaining({
          Destination: { ToAddresses: ['noreply@fakefourrecords.com'] },
        })
      );
    });

    it('should set ReplyTo to submitter email', async () => {
      await contactAction(mockInitialState, validFormData());

      expect(mockSendEmailParams).toHaveBeenCalledWith(
        expect.objectContaining({
          ReplyToAddresses: ['jane@example.com'],
        })
      );
    });

    it('should use the reason label in the subject line', async () => {
      await contactAction(mockInitialState, validFormData());

      expect(mockSendEmailParams).toHaveBeenCalledWith(
        expect.objectContaining({
          Message: expect.objectContaining({
            Subject: expect.objectContaining({
              Data: expect.stringContaining('Question'),
            }),
          }),
        })
      );
    });

    it('should use raw reason value when no matching label exists', async () => {
      mockGetActionState.mockReturnValue({
        formState: { fields: {}, success: false, errors: {} },
        parsed: {
          success: true,
          data: { ...validParsedData, reason: 'custom-reason' },
        },
      });

      await contactAction(mockInitialState, validFormData());

      expect(mockSendEmailParams).toHaveBeenCalledWith(
        expect.objectContaining({
          Message: expect.objectContaining({
            Subject: expect.objectContaining({
              Data: expect.stringContaining('custom-reason'),
            }),
          }),
        })
      );
    });

    it('should set phone to undefined when empty string', async () => {
      mockGetActionState.mockReturnValue({
        formState: { fields: {}, success: false, errors: {} },
        parsed: {
          success: true,
          data: { ...validParsedData, phone: '' },
        },
      });

      await contactAction(mockInitialState, validFormData());

      expect(mockBuildHtml).toHaveBeenCalledWith(expect.objectContaining({ phone: undefined }));
    });
  });

  describe('email send errors', () => {
    beforeEach(() => {
      mockGetActionState.mockReturnValue({
        formState: { fields: {}, success: false, errors: {} },
        parsed: { success: true, data: validParsedData },
      });
    });

    it('should return error when EMAIL_FROM is not set', async () => {
      vi.stubEnv('EMAIL_FROM', '');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await contactAction(mockInitialState, validFormData());

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(
        expect.objectContaining({}),
        'Unable to send message. Please try again later.'
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'EMAIL_FROM or CONTACT_EMAIL environment variable is not set'
      );
      expect(mockSend).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle SES send failure', async () => {
      mockSend.mockRejectedValueOnce(new Error('SES failure'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await contactAction(mockInitialState, validFormData());

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(
        expect.objectContaining({}),
        'Unable to send message. Please try again later.'
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Contact form email send error:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
