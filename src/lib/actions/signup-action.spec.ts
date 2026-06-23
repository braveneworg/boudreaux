/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Get the mocked functions using hoisted
import { signupAction } from '@/lib/actions/signup-action';
import { DataError } from '@/lib/types/domain/errors';
import type { FormState } from '@/lib/types/form-state';
import { loggers } from '@/lib/utils/logger';

import type { Mock } from 'vitest';

const mockCreateUser = vi.hoisted(() => vi.fn());
const mockSignIn = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() => vi.fn());
const mockGetActionState = vi.hoisted(() => vi.fn());
const mockSetUnknownError = vi.hoisted(() => vi.fn());
const mockGenerateUsername = vi.hoisted(() => vi.fn(() => 'test-user-1234'));
const mockHeaders = vi.hoisted(() =>
  vi.fn(() => ({
    get: vi.fn(() => '127.0.0.1'),
  }))
);
const mockVerifyTurnstile = vi.hoisted(() => vi.fn());
const mockLimiterCheck = vi.hoisted(() => vi.fn());

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

// Mock rate limiter — `check` is a controllable hoisted mock so individual
// tests can force the rate-limit-exceeded path. The singleton limiter is built
// once at module load, so the same `check` instance is reused on every call.
vi.mock('@/lib/utils/rate-limit', () => ({
  rateLimit: vi.fn(() => ({
    check: mockLimiterCheck,
  })),
}));

// Mock Turnstile verification
vi.mock('@/lib/utils/verify-turnstile', () => ({
  verifyTurnstile: mockVerifyTurnstile,
}));

// Mock email security
vi.mock('@/lib/utils/email-security', () => ({
  validateEmailSecurity: vi.fn(() => ({ isValid: true })),
}));

// Mock audit logging
vi.mock('@/lib/utils/audit-log', () => ({
  logSecurityEvent: vi.fn(),
}));

// Mock dependencies
// Use relative module path consistent with action source import to ensure CI resolution
vi.mock('@/auth', () => ({
  signIn: mockSignIn,
}));

vi.mock('@/lib/repositories/user-repository', () => ({
  UserRepository: {
    create: mockCreateUser,
  },
}));

vi.mock('unique-username-generator', () => ({
  generateUsername: mockGenerateUsername,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
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

vi.mock('@/lib/validation/signup-schema');

describe('signupAction', () => {
  const mockFormData = new FormData();
  const mockInitialState: FormState = {
    errors: {},
    fields: {},
    success: false,
  };

  beforeEach(() => {
    mockFormData.set('email', 'test@example.com');
    mockFormData.set('termsAndConditions', 'true');
    mockFormData.set('cf-turnstile-response', 'test-turnstile-token');

    vi.mocked(mockGenerateUsername).mockReturnValue('test-user-1234');
    // Default to passing Turnstile verification
    mockVerifyTurnstile.mockResolvedValue({ success: true });
    // Default to passing the rate limit (clearMocks resets the impl each test).
    mockLimiterCheck.mockResolvedValue(undefined);
  });

  describe('successful signup flow', () => {
    it('should create user and send magic link when data is valid', async () => {
      const mockFormState: FormState = {
        fields: { email: 'test@example.com', termsAndConditions: true },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { email: 'test@example.com', termsAndConditions: true },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockSignIn).mockResolvedValue(undefined);
      mockCreateUser.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
      });

      // Set up redirect mock to throw NEXT_REDIRECT error
      mockRedirect.mockImplementation(() => {
        throw Error('NEXT_REDIRECT');
      });

      await expect(signupAction(mockInitialState, mockFormData)).rejects.toThrow('NEXT_REDIRECT');

      expect(mockCreateUser).toHaveBeenCalledWith({
        email: 'test@example.com',
        emailVerified: null,
        name: null,
        image: null,
        username: 'test-user-1234',
      });

      expect(mockSignIn).toHaveBeenCalledWith('nodemailer', {
        email: 'test@example.com',
        redirect: false,
        redirectTo: '/',
      });

      expect(mockRedirect).toHaveBeenCalledWith('/success/signup?email=test%40example.com');
    });

    it('should generate username when creating user', async () => {
      const mockFormState: FormState = {
        fields: { email: 'test@example.com', termsAndConditions: true },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { email: 'test@example.com', termsAndConditions: true },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      mockCreateUser.mockResolvedValue({ id: '1' });
      vi.mocked(mockSignIn).mockResolvedValue(undefined);

      // Set up redirect mock to throw NEXT_REDIRECT error
      mockRedirect.mockImplementation(() => {
        throw Error('NEXT_REDIRECT');
      });

      await expect(signupAction(mockInitialState, mockFormData)).rejects.toThrow('NEXT_REDIRECT');

      expect(mockGenerateUsername).toHaveBeenCalledWith('', 4);
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'test-user-1234',
        })
      );
    });
  });

  describe('Turnstile verification', () => {
    it('should return error when Turnstile token is missing', async () => {
      const formDataWithoutToken = new FormData();
      formDataWithoutToken.set('email', 'test@example.com');
      formDataWithoutToken.set('termsAndConditions', 'true');

      const result = await signupAction(mockInitialState, formDataWithoutToken);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain(
        'CAPTCHA verification required. Please complete the verification.'
      );
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('should return error when Turnstile verification fails', async () => {
      mockVerifyTurnstile.mockResolvedValue({
        success: false,
        error: 'Invalid token',
      });

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain('Invalid token');
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('should use default error message when Turnstile returns no error string', async () => {
      mockVerifyTurnstile.mockResolvedValue({
        success: false,
        error: undefined,
      });

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain('CAPTCHA verification failed. Please try again.');
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('should use default CAPTCHA error message when Turnstile error is empty string', async () => {
      mockVerifyTurnstile.mockResolvedValue({
        success: false,
        error: '',
      });

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain('CAPTCHA verification failed. Please try again.');
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('should proceed when Turnstile verification succeeds', async () => {
      mockVerifyTurnstile.mockResolvedValue({ success: true });

      const mockFormState: FormState = {
        fields: { email: 'test@example.com', termsAndConditions: true },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { email: 'test@example.com', termsAndConditions: true },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      mockCreateUser.mockResolvedValue({ id: '1', username: 'test-user-1234' });
      vi.mocked(mockSignIn).mockResolvedValue(undefined);
      mockRedirect.mockImplementation(() => {
        throw Error('NEXT_REDIRECT');
      });

      await expect(signupAction(mockInitialState, mockFormData)).rejects.toThrow('NEXT_REDIRECT');
      expect(mockVerifyTurnstile).toHaveBeenCalledWith('test-turnstile-token', '127.0.0.1');
      expect(mockCreateUser).toHaveBeenCalled();
    });
  });

  describe('rate limiting', () => {
    it('returns a too-many-attempts error when the rate limiter rejects', async () => {
      mockLimiterCheck.mockRejectedValue(new Error('rate limit exceeded'));

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain('Too many signup attempts. Please try again later.');
      expect(mockVerifyTurnstile).not.toHaveBeenCalled();
      expect(mockCreateUser).not.toHaveBeenCalled();
    });
  });

  describe('validation failures', () => {
    it('should return form state with errors when validation fails', async () => {
      const mockFormState: FormState = {
        fields: { email: 'invalid-email' },
        success: false,
        errors: { email: ['Invalid email format'] },
      };

      const mockParsed = {
        success: false,
        error: {
          issues: [{ path: ['email'], message: 'Invalid email format' }],
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result).toEqual(mockFormState);
      expect(mockCreateUser).not.toHaveBeenCalled();
      expect(mockSignIn).not.toHaveBeenCalled();
    });

    it('should return error when email security validation fails', async () => {
      const mockFormState: FormState = {
        fields: { email: 'disposable@tempmail.com', termsAndConditions: true },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { email: 'disposable@tempmail.com', termsAndConditions: true },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      // Mock email security to fail
      const { validateEmailSecurity } = await import('@/lib/utils/email-security');
      vi.mocked(validateEmailSecurity).mockReturnValueOnce({
        isValid: false,
        error: 'Disposable email addresses are not allowed',
      });

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.email).toEqual(['Disposable email addresses are not allowed']);
      expect(mockCreateUser).not.toHaveBeenCalled();
    });

    it('should return generic error when email security validation fails without error message', async () => {
      const mockFormState: FormState = {
        fields: { email: 'invalid@example.com', termsAndConditions: true },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { email: 'invalid@example.com', termsAndConditions: true },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      // Mock email security to fail without specific error
      const { validateEmailSecurity } = await import('@/lib/utils/email-security');
      vi.mocked(validateEmailSecurity).mockReturnValueOnce({
        isValid: false,
      });

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.email).toEqual(['Invalid email address']);
      expect(mockCreateUser).not.toHaveBeenCalled();
    });
  });

  describe('database errors', () => {
    beforeEach(() => {
      const mockFormState: FormState = {
        fields: { email: 'test@example.com', termsAndConditions: true },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { email: 'test@example.com', termsAndConditions: true },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });
    });

    it('should silently send magic-link and redirect on duplicate email (no enumeration)', async () => {
      const duplicateEmailError = new DataError('DUPLICATE', 'Unique constraint failed');

      mockCreateUser.mockRejectedValue(duplicateEmailError);
      vi.mocked(mockSignIn).mockResolvedValue(undefined);
      mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT');
      });

      await expect(signupAction(mockInitialState, mockFormData)).rejects.toThrow('NEXT_REDIRECT');

      // Magic-link flow should be triggered for the duplicate email too
      expect(mockSignIn).toHaveBeenCalledWith('nodemailer', {
        email: 'test@example.com',
        redirect: false,
        redirectTo: '/',
      });
      // Should redirect to the same success page as a new signup
      expect(mockRedirect).toHaveBeenCalledWith('/success/signup?email=test%40example.com');
    });

    it('still redirects on duplicate email when the silent sign-in magic link fails to send', async () => {
      // Account-enumeration defense: even if the magic-link signIn throws, the
      // error is logged (loggers.auth.error) and swallowed, and the flow still
      // redirects to the same success page as a brand-new signup.
      const duplicateEmailError = new DataError('DUPLICATE', 'Unique constraint failed');

      mockCreateUser.mockRejectedValue(duplicateEmailError);
      vi.mocked(mockSignIn).mockRejectedValue(new Error('SES send failed'));
      const errorSpy = vi.spyOn(loggers.auth, 'error').mockImplementation(() => {});
      mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT');
      });

      await expect(signupAction(mockInitialState, mockFormData)).rejects.toThrow('NEXT_REDIRECT');

      expect(errorSpy).toHaveBeenCalledWith(
        'Failed to send sign-in magic link on duplicate email',
        expect.any(Error)
      );
      expect(mockRedirect).toHaveBeenCalledWith('/success/signup?email=test%40example.com');

      errorSpy.mockRestore();
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new DataError('TIMEOUT', 'Database timed out');
      mockCreateUser.mockRejectedValue(timeoutError);

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
    });

    it('should handle timeout errors when formState.errors is undefined', async () => {
      const timeoutError = new DataError('UNKNOWN', 'timeout exceeded');

      const mockFormState: FormState = {
        fields: { email: 'test@example.com', termsAndConditions: true },
        success: false,
        hasTimeout: false,
        // errors property is undefined
      };

      const mockParsed = {
        success: true,
        data: { email: 'test@example.com', termsAndConditions: true },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      mockCreateUser.mockRejectedValue(timeoutError);

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors).toBeDefined();
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
    });

    it('should handle various timeout error formats', async () => {
      const timeoutErrors = [
        new DataError('UNKNOWN', 'timeout exceeded'),
        new DataError('UNKNOWN', 'operation timed out'),
        new DataError('TIMEOUT', 'Database timed out'),
      ];

      for (const error of timeoutErrors) {
        const mockFormState: FormState = {
          fields: { email: 'test@example.com', termsAndConditions: true },
          success: false,
          hasTimeout: false,
          errors: {},
        };

        vi.mocked(mockGetActionState).mockReturnValue({
          formState: mockFormState,
          parsed: {
            success: true,
            data: { email: 'test@example.com', termsAndConditions: true },
          },
        });

        mockCreateUser.mockRejectedValue(error);

        const result = await signupAction(mockInitialState, mockFormData);

        expect(result.hasTimeout).toBe(true);
        expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
      }
    });

    it('should handle other data-access errors', async () => {
      const unknownError = new DataError('UNKNOWN', 'Unknown error');

      mockCreateUser.mockRejectedValue(unknownError);

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle general errors', async () => {
      const generalError = Error('Something went wrong');
      mockCreateUser.mockRejectedValue(generalError);

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe('signIn errors', () => {
    it('should handle signIn failures gracefully', async () => {
      const mockFormState: FormState = {
        fields: { email: 'test@example.com', termsAndConditions: true },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { email: 'test@example.com', termsAndConditions: true },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      mockCreateUser.mockResolvedValue({ id: '1' });
      vi.mocked(mockSignIn).mockRejectedValue(Error('SignIn failed'));

      // Set up redirect mock to NOT throw for error test
      mockRedirect.mockImplementation(() => {
        // This shouldn't be called in error case
      });

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalled();
    });
  });

  describe('IP address resolution', () => {
    beforeEach(() => {
      const mockFormState: FormState = {
        fields: { email: 'test@example.com', termsAndConditions: true },
        success: false,
        errors: { email: ['Invalid email format'] },
      };

      const mockParsed = {
        success: false,
        error: {
          issues: [{ path: ['email'], message: 'Invalid email format' }],
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });
    });

    it('should fall back to x-real-ip when x-forwarded-for is null', async () => {
      mockHeaders.mockResolvedValueOnce({
        get: vi.fn((name: string) => {
          if (name === 'x-forwarded-for') return null;
          if (name === 'x-real-ip') return '10.0.0.1';
          return null;
        }),
      } as unknown as { get: Mock<() => string> });

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockVerifyTurnstile).toHaveBeenCalledWith('test-turnstile-token', '10.0.0.1');
    });

    it('should fall back to anonymous when both x-forwarded-for and x-real-ip are null', async () => {
      mockHeaders.mockResolvedValueOnce({
        get: vi.fn(() => null),
      } as unknown as { get: Mock<() => string> });

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockVerifyTurnstile).toHaveBeenCalledWith('test-turnstile-token', 'anonymous');
    });
  });

  describe('edge cases', () => {
    it('should not redirect when signup fails', async () => {
      const mockFormState: FormState = {
        fields: { email: 'test@example.com' },
        success: false,
        errors: { termsAndConditions: ['Terms must be accepted'] },
      };

      const mockParsed = {
        success: false,
        error: { issues: [] },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result).toEqual(mockFormState);
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('should preserve form state fields and errors', async () => {
      const mockFormState: FormState = {
        fields: { email: 'test@example.com', termsAndConditions: false },
        success: false,
        errors: { termsAndConditions: ['Required field'] },
      };

      const mockParsed = {
        success: false,
        error: { issues: [] },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.fields).toEqual({
        email: 'test@example.com',
        termsAndConditions: false,
      });
      expect(result.errors).toEqual({ termsAndConditions: ['Required field'] });
    });
  });
});
