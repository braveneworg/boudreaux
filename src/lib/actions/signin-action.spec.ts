import { beforeEach } from 'vitest';

import { signinAction } from '@/lib/actions/signin-action';

// Get the mocked functions using hoisted
const mockSignIn = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() => vi.fn());
const mockGetActionState = vi.hoisted(() => vi.fn());
const mockSetUnknownError = vi.hoisted(() => vi.fn());
const mockHeaders = vi.hoisted(() =>
  vi.fn(() => ({
    get: vi.fn(() => '127.0.0.1'),
  }))
);
const mockVerifyTurnstile = vi.hoisted(() => vi.fn());

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

// Mock rate limiter
vi.mock('@/lib/utils/rate-limit', () => ({
  rateLimit: vi.fn(() => ({
    check: vi.fn().mockResolvedValue(undefined), // Always pass rate limit in tests
  })),
}));

// Mock Turnstile verification
vi.mock('@/lib/utils/verify-turnstile', () => ({
  verifyTurnstile: mockVerifyTurnstile,
}));

// Mock dependencies
// Use relative module path consistent with action source import to ensure CI resolution
vi.mock('../../../auth', () => ({
  signIn: mockSignIn,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/lib/utils/auth/get-action-state', () => ({
  default: mockGetActionState,
}));

vi.mock('@/lib/utils/auth/auth-utils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    setUnknownError: mockSetUnknownError,
  };
});

vi.mock('@/lib/validation/signin-schema');

type FormState = {
  fields: Record<string, string>;
  success: boolean;
  errors: Record<string, string[]>;
};

describe('signinAction', () => {
  const mockFormData = new FormData();
  const mockInitialState: FormState = {
    errors: {},
    fields: {},
    success: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFormData.set('email', 'test@example.com');
    mockFormData.set('cf-turnstile-response', 'test-turnstile-token');
    // Default to passing Turnstile verification
    mockVerifyTurnstile.mockResolvedValue({ success: true });
  });

  describe('successful signin flow', () => {
    it('should send magic link when email is valid', async () => {
      const mockFormState: FormState = {
        fields: { email: 'test@example.com' },
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { email: 'test@example.com' },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockSignIn).mockResolvedValue(undefined);

      // Set up redirect mock to throw NEXT_REDIRECT error
      mockRedirect.mockImplementation(() => {
        throw Error('NEXT_REDIRECT');
      });

      await expect(signinAction(mockInitialState, mockFormData)).rejects.toThrow('NEXT_REDIRECT');

      expect(mockSignIn).toHaveBeenCalledWith('nodemailer', {
        email: 'test@example.com',
        redirect: false,
        redirectTo: '/',
      });

      expect(mockRedirect).toHaveBeenCalledWith('/success/signin?email=test%40example.com');
    });

    it('should use nodemailer provider for magic link', async () => {
      const mockFormState: FormState = {
        fields: { email: 'user@test.com' },
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { email: 'user@test.com' },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockSignIn).mockResolvedValue(undefined);

      await expect(signinAction(mockInitialState, mockFormData)).rejects.toThrow('NEXT_REDIRECT');

      expect(mockSignIn).toHaveBeenCalledWith('nodemailer', {
        email: 'user@test.com',
        redirect: false,
        redirectTo: '/',
      });
    });

    it('should set redirect parameter correctly', async () => {
      const mockFormState: FormState = {
        fields: { email: 'test@example.com' },
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { email: 'test@example.com' },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockSignIn).mockResolvedValue(undefined);

      await expect(signinAction(mockInitialState, mockFormData)).rejects.toThrow('NEXT_REDIRECT');

      expect(mockSignIn).toHaveBeenCalledWith('nodemailer', {
        email: 'test@example.com',
        redirect: false,
        redirectTo: '/',
      });
    });
  });

  describe('Turnstile verification', () => {
    it('should return error when Turnstile token is missing', async () => {
      const formDataWithoutToken = new FormData();
      formDataWithoutToken.set('email', 'test@example.com');

      const result = await signinAction(mockInitialState, formDataWithoutToken);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain(
        'CAPTCHA verification required. Please complete the verification.'
      );
      expect(mockSignIn).not.toHaveBeenCalled();
    });

    it('should return error when Turnstile verification fails', async () => {
      mockVerifyTurnstile.mockResolvedValue({
        success: false,
        error: 'Invalid token',
      });

      const result = await signinAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toContain('Invalid token');
      expect(mockSignIn).not.toHaveBeenCalled();
    });

    it('should proceed when Turnstile verification succeeds', async () => {
      mockVerifyTurnstile.mockResolvedValue({ success: true });

      const mockFormState: FormState = {
        fields: { email: 'test@example.com' },
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { email: 'test@example.com' },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockSignIn).mockResolvedValue(undefined);
      mockRedirect.mockImplementation(() => {
        throw Error('NEXT_REDIRECT');
      });

      await expect(signinAction(mockInitialState, mockFormData)).rejects.toThrow('NEXT_REDIRECT');
      expect(mockVerifyTurnstile).toHaveBeenCalledWith('test-turnstile-token', '127.0.0.1');
      expect(mockSignIn).toHaveBeenCalled();
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

      const result = await signinAction(mockInitialState, mockFormData);

      expect(result).toEqual(mockFormState);
      expect(mockSignIn).not.toHaveBeenCalled();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('should preserve validation errors and fields', async () => {
      const mockFormState: FormState = {
        fields: { email: '' },
        success: false,
        errors: { email: ['Email is required'] },
      };

      const mockParsed = {
        success: false,
        error: { issues: [] },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await signinAction(mockInitialState, mockFormData);

      expect(result.fields).toEqual({ email: '' });
      expect(result.errors).toEqual({ email: ['Email is required'] });
      expect(result.success).toBe(false);
    });
  });

  describe('signIn errors', () => {
    it('should handle signIn failures and set unknown error', async () => {
      const mockFormState: FormState = {
        fields: { email: 'test@example.com' },
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { email: 'test@example.com' },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockSignIn).mockRejectedValue(Error('SignIn failed'));

      // Set up redirect mock to NOT throw for error test
      mockRedirect.mockImplementation(() => {
        // This shouldn't be called in error case
      });

      const result = await signinAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSignIn).toHaveBeenCalledWith('nodemailer', {
        email: 'test@example.com',
        redirect: false,
        redirectTo: '/',
      });
    });

    it('should call setUnknownError in finally block when there are errors', async () => {
      const mockFormState: FormState = {
        fields: { email: 'test@example.com' },
        success: false,
        errors: { general: ['Network error'] },
      };

      const mockParsed = {
        success: true,
        data: { email: 'test@example.com' },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockSignIn).mockRejectedValue(Error('Network failure'));

      // Set up redirect mock to NOT throw for error test
      mockRedirect.mockImplementation(() => {
        // This shouldn't be called in error case
      });

      const result = await signinAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should not call setUnknownError when success is true', async () => {
      const mockFormState: FormState = {
        fields: { email: 'test@example.com' },
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { email: 'test@example.com' },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockSignIn).mockResolvedValue(undefined);

      // Set up redirect mock to throw NEXT_REDIRECT error
      mockRedirect.mockImplementation(() => {
        throw Error('NEXT_REDIRECT');
      });

      // This will throw due to redirect, but we expect it
      await expect(signinAction(mockInitialState, mockFormData)).rejects.toThrow('NEXT_REDIRECT');

      expect(mockSetUnknownError).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should not redirect when signin fails', async () => {
      const mockFormState: FormState = {
        fields: { email: 'test@example.com' },
        success: false,
        errors: { email: ['Invalid email'] },
      };

      const mockParsed = {
        success: false,
        error: { issues: [] },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await signinAction(mockInitialState, mockFormData);

      expect(result).toEqual(mockFormState);
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('should handle empty form data gracefully', async () => {
      const emptyFormData = new FormData();
      // Add turnstile token to pass CAPTCHA check
      emptyFormData.set('cf-turnstile-response', 'test-turnstile-token');

      const mockFormState: FormState = {
        fields: {},
        success: false,
        errors: { email: ['Email is required'] },
      };

      const mockParsed = {
        success: false,
        error: { issues: [] },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await signinAction(mockInitialState, emptyFormData);

      expect(result.success).toBe(false);
      expect(result.errors).toEqual({ email: ['Email is required'] });
    });

    it('should preserve form state structure', async () => {
      const mockFormState: FormState = {
        fields: { email: 'test@example.com', rememberMe: 'true' },
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: false,
        error: { issues: [] },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await signinAction(mockInitialState, mockFormData);

      expect(result.fields).toEqual({
        email: 'test@example.com',
        rememberMe: 'true',
      });
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('fields');
    });
  });

  describe('URL encoding', () => {
    it('should properly encode email in redirect URL', async () => {
      const emailWithSpecialChars = 'test+user@example.com';
      const mockFormState: FormState = {
        fields: { email: emailWithSpecialChars },
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { email: emailWithSpecialChars },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockSignIn).mockResolvedValue(undefined);

      // Set up redirect mock to throw NEXT_REDIRECT error
      mockRedirect.mockImplementation(() => {
        throw Error('NEXT_REDIRECT');
      });

      await expect(signinAction(mockInitialState, mockFormData)).rejects.toThrow('NEXT_REDIRECT');

      expect(mockRedirect).toHaveBeenCalledWith(
        `/success/signin?email=${encodeURIComponent(emailWithSpecialChars)}`
      );
    });
  });
});
