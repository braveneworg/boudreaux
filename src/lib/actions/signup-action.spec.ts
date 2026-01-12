// Get the mocked functions using hoisted
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { signupAction } from '@/lib/actions/signup-action';
import { CustomPrismaAdapter } from '@/lib/prisma-adapter';
import type { FormState } from '@/lib/types/form-state';

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
vi.mock('../../../auth', () => ({
  signIn: mockSignIn,
}));

vi.mock('@/lib/prisma-adapter', () => ({
  CustomPrismaAdapter: vi.fn(),
}));

vi.mock('../prisma', () => ({
  prisma: {},
}));

vi.mock('unique-username-generator', () => ({
  generateUsername: mockGenerateUsername,
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

vi.mock('@/lib/validation/signup-schema');

describe('signupAction', () => {
  const mockFormData = new FormData();
  const mockInitialState: FormState = {
    errors: {},
    fields: {},
    success: false,
  };

  const mockAdapter = {
    createUser: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFormData.set('email', 'test@example.com');
    mockFormData.set('termsAndConditions', 'true');

    vi.mocked(CustomPrismaAdapter).mockReturnValue(mockAdapter);
    vi.mocked(mockGenerateUsername).mockReturnValue('test-user-1234');
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
      mockAdapter.createUser.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
      });

      // Set up redirect mock to throw NEXT_REDIRECT error
      mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT');
      });

      await expect(signupAction(mockInitialState, mockFormData)).rejects.toThrow('NEXT_REDIRECT');

      expect(mockAdapter.createUser).toHaveBeenCalledWith({
        id: '',
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

      expect(mockRedirect).toHaveBeenCalledWith('/success/signup?email=test@example.com');
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

      mockAdapter.createUser.mockResolvedValue({ id: '1' });
      vi.mocked(mockSignIn).mockResolvedValue(undefined);

      await expect(signupAction(mockInitialState, mockFormData)).rejects.toThrow('NEXT_REDIRECT');

      expect(mockGenerateUsername).toHaveBeenCalledWith('', 4);
      expect(mockAdapter.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'test-user-1234',
        })
      );
    });
  });

  // Note: Rate limiting is tested separately in src/app/lib/utils/rate-limit.spec.ts
  // The rate limit error path in signup action (lines 40-45) requires integration testing
  // due to architectural limitations with the singleton rate limiter created at module load time.

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
      expect(mockAdapter.createUser).not.toHaveBeenCalled();
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
      expect(mockAdapter.createUser).not.toHaveBeenCalled();
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
      expect(mockAdapter.createUser).not.toHaveBeenCalled();
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

    it('should handle duplicate email errors', async () => {
      const duplicateEmailError = new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '4.0.0',
        meta: { target: 'User_email_key' },
      });

      mockAdapter.createUser.mockRejectedValue(duplicateEmailError);

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.email).toEqual(['Account with this email already exists']);
    });

    it('should handle duplicate email errors when formState.errors is undefined', async () => {
      const duplicateEmailError = new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '4.0.0',
        meta: { target: 'User_email_key' },
      });

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

      mockAdapter.createUser.mockRejectedValue(duplicateEmailError);

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.email).toEqual(['Account with this email already exists']);
    });

    it('should handle P2002 error with different target (not email)', async () => {
      const duplicateUsernameError = new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '4.0.0',
        meta: { target: 'User_username_key' },
      });

      mockAdapter.createUser.mockRejectedValue(duplicateUsernameError);

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Connection ETIMEOUT');
      mockAdapter.createUser.mockRejectedValue(timeoutError);

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
    });

    it('should handle timeout errors when formState.errors is undefined', async () => {
      const timeoutError = new Error('timeout exceeded');

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

      mockAdapter.createUser.mockRejectedValue(timeoutError);

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors).toBeDefined();
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
    });

    it('should handle various timeout error formats', async () => {
      const timeoutErrors = [
        new Error('timeout exceeded'),
        new Error('operation timed out'),
        Object.assign(new Error('Network timeout'), { code: 'ETIMEOUT' }),
      ];

      for (const error of timeoutErrors) {
        vi.clearAllMocks();
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

        mockAdapter.createUser.mockRejectedValue(error);

        const result = await signupAction(mockInitialState, mockFormData);

        expect(result.hasTimeout).toBe(true);
        expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
      }
    });

    it('should handle unknown Prisma errors', async () => {
      const unknownError = new PrismaClientKnownRequestError('Unknown error', {
        code: 'P1000',
        clientVersion: '4.0.0',
      });

      mockAdapter.createUser.mockRejectedValue(unknownError);

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle general errors', async () => {
      const generalError = new Error('Something went wrong');
      mockAdapter.createUser.mockRejectedValue(generalError);

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

      mockAdapter.createUser.mockResolvedValue({ id: '1' });
      vi.mocked(mockSignIn).mockRejectedValue(new Error('SignIn failed'));

      // Set up redirect mock to NOT throw for error test
      mockRedirect.mockImplementation(() => {
        // This shouldn't be called in error case
      });

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalled();
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
