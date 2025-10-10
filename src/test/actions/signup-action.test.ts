import { beforeEach, describe, expect, it, vi } from 'vitest';

// Get the mocked functions using hoisted
const mockSignIn = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() => vi.fn());
const mockGetActionState = vi.hoisted(() => vi.fn());
const mockSetUnknownError = vi.hoisted(() => vi.fn());
const mockGenerateUsername = vi.hoisted(() => vi.fn(() => 'test-user-1234'));

// Mock dependencies
vi.mock('/Users/cchaos/projects/braveneworg/boudreaux/auth.ts', () => ({
  signIn: mockSignIn,
}));

vi.mock('@/app/lib/prisma-adapter', () => ({
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

vi.mock('@/app/lib/utils/auth/get-action-state', () => ({
  default: mockGetActionState,
}));

vi.mock('@/app/lib/utils/auth/auth-utils', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    setUnknownError: mockSetUnknownError,
  };
});

vi.mock('@/app/lib/validation/signup-schema');

import { signupAction } from '@/app/lib/actions/signup-action';
import type { FormState } from '@/app/lib/types/form-state';
import { CustomPrismaAdapter } from '@/app/lib/prisma-adapter';
import { Prisma } from '@prisma/client';

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
      mockAdapter.createUser.mockResolvedValue({ id: '1', email: 'test@example.com' });

      // Set up redirect mock to throw NEXT_REDIRECT error
      mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT');
      });

      await expect(signupAction(mockInitialState, mockFormData)).rejects.toThrow('NEXT_REDIRECT');

      expect(mockAdapter.createUser).toHaveBeenCalledWith({
        email: 'test@example.com',
        termsAndConditions: true,
        username: 'test-user-1234',
      });

      expect(mockSignIn).toHaveBeenCalledWith('nodemailer', {
        email: 'test@example.com',
        redirect: false,
        redirectTo: '/',
      });

      expect(mockRedirect).toHaveBeenCalledWith('/success?email=test@example.com');
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

  describe('validation failures', () => {
    it('should return form state with errors when validation fails', async () => {
      const mockFormState: FormState = {
        fields: { email: 'invalid-email' },
        success: false,
        errors: { email: ['Invalid email format'] },
      };

      const mockParsed = {
        success: false,
        error: { issues: [{ path: ['email'], message: 'Invalid email format' }] },
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
      const duplicateEmailError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '4.0.0',
          meta: { target: 'User_email_key' },
        }
      );

      mockAdapter.createUser.mockRejectedValue(duplicateEmailError);

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.email).toEqual(['Account with this email already exists']);
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Connection ETIMEOUT');
      mockAdapter.createUser.mockRejectedValue(timeoutError);

      const result = await signupAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
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
          parsed: { success: true, data: { email: 'test@example.com', termsAndConditions: true } },
        });

        mockAdapter.createUser.mockRejectedValue(error);

        const result = await signupAction(mockInitialState, mockFormData);

        expect(result.hasTimeout).toBe(true);
        expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
      }
    });

    it('should handle unknown Prisma errors', async () => {
      const unknownError = new Prisma.PrismaClientKnownRequestError(
        'Unknown error',
        {
          code: 'P1000',
          clientVersion: '4.0.0',
        }
      );

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

      expect(result.fields).toEqual({ email: 'test@example.com', termsAndConditions: false });
      expect(result.errors).toEqual({ termsAndConditions: ['Required field'] });
    });
  });
});