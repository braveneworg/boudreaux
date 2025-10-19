// Get the mocked functions using hoisted
const mockAuth = vi.hoisted(() => vi.fn());
const mockSignOut = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() => vi.fn());
const mockGetActionState = vi.hoisted(() => vi.fn());
const mockSetUnknownError = vi.hoisted(() => vi.fn());
const mockUpdateUser = vi.hoisted(() => vi.fn());

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock dependencies
vi.mock('/Users/cchaos/projects/braveneworg/boudreaux/auth.ts', () => ({
  auth: mockAuth,
  signOut: mockSignOut,
}));

vi.mock('@/app/lib/prisma-adapter', () => ({
  CustomPrismaAdapter: vi.fn(() => ({
    updateUser: mockUpdateUser,
  })),
}));

vi.mock('../prisma', () => ({
  prisma: {},
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/app/lib/utils/auth/get-action-state', () => ({
  default: mockGetActionState,
}));

vi.mock('@/app/lib/utils/auth/auth-utils', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    setUnknownError: mockSetUnknownError,
  };
});

vi.mock('@/app/lib/validation/change-email-schema');

import { changeEmailAction } from '@/app/lib/actions/change-email-action';
import type { FormState } from '@/app/lib/types/form-state';
import { Prisma } from '@prisma/client';

describe('changeEmailAction', () => {
  const mockFormData = new FormData();
  const mockInitialState: FormState = {
    errors: {},
    fields: {},
    success: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFormData.set('email', 'newemail@example.com');
    mockFormData.set('confirmEmail', 'newemail@example.com');
    mockFormData.set('previousEmail', 'oldemail@example.com');
  });

  describe('successful email change flow', () => {
    it('should update email and sign out when data is valid', async () => {
      const mockFormState: FormState = {
        fields: {
          email: 'newemail@example.com',
          confirmEmail: 'newemail@example.com',
          previousEmail: 'oldemail@example.com',
        },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          email: 'newemail@example.com',
          confirmEmail: 'newemail@example.com',
          previousEmail: 'oldemail@example.com',
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123', email: 'oldemail@example.com' },
      });

      vi.mocked(mockUpdateUser).mockResolvedValue({
        id: 'user-123',
        email: 'newemail@example.com',
      });

      vi.mocked(mockSignOut).mockResolvedValue(undefined);

      // Set up redirect mock to throw NEXT_REDIRECT error
      mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT');
      });

      await expect(changeEmailAction(mockInitialState, mockFormData)).rejects.toThrow(
        'NEXT_REDIRECT'
      );

      expect(mockUpdateUser).toHaveBeenCalledWith({
        id: 'user-123',
        email: 'newemail@example.com',
        previousEmail: 'oldemail@example.com',
      });

      expect(mockSignOut).toHaveBeenCalledWith({ redirect: false });
      expect(mockRedirect).toHaveBeenCalledWith(
        '/success/change-email?email=newemail%40example.com'
      );
    });

    it('should use session email as previousEmail when not provided', async () => {
      const mockFormState: FormState = {
        fields: {
          email: 'newemail@example.com',
          confirmEmail: 'newemail@example.com',
        },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          email: 'newemail@example.com',
          confirmEmail: 'newemail@example.com',
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123', email: 'session@example.com' },
      });

      vi.mocked(mockUpdateUser).mockResolvedValue({
        id: 'user-123',
        email: 'newemail@example.com',
      });

      vi.mocked(mockSignOut).mockResolvedValue(undefined);
      mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT');
      });

      await expect(changeEmailAction(mockInitialState, mockFormData)).rejects.toThrow(
        'NEXT_REDIRECT'
      );

      expect(mockUpdateUser).toHaveBeenCalledWith({
        id: 'user-123',
        email: 'newemail@example.com',
        previousEmail: 'session@example.com',
      });
    });

    it('should use empty string for previousEmail when session has no email', async () => {
      const mockFormState: FormState = {
        fields: {
          email: 'newemail@example.com',
          confirmEmail: 'newemail@example.com',
        },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          email: 'newemail@example.com',
          confirmEmail: 'newemail@example.com',
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123' },
      });

      vi.mocked(mockUpdateUser).mockResolvedValue({
        id: 'user-123',
        email: 'newemail@example.com',
      });

      vi.mocked(mockSignOut).mockResolvedValue(undefined);
      mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT');
      });

      await expect(changeEmailAction(mockInitialState, mockFormData)).rejects.toThrow(
        'NEXT_REDIRECT'
      );

      expect(mockUpdateUser).toHaveBeenCalledWith({
        id: 'user-123',
        email: 'newemail@example.com',
        previousEmail: '',
      });
    });

    it('should set hasTimeout to false on successful update', async () => {
      const mockFormState: FormState = {
        fields: {
          email: 'newemail@example.com',
          confirmEmail: 'newemail@example.com',
          previousEmail: 'oldemail@example.com',
        },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          email: 'newemail@example.com',
          confirmEmail: 'newemail@example.com',
          previousEmail: 'oldemail@example.com',
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123', email: 'oldemail@example.com' },
      });

      vi.mocked(mockUpdateUser).mockResolvedValue({
        id: 'user-123',
        email: 'newemail@example.com',
      });

      vi.mocked(mockSignOut).mockResolvedValue(undefined);
      mockRedirect.mockImplementation(() => {
        throw new Error('NEXT_REDIRECT');
      });

      await expect(changeEmailAction(mockInitialState, mockFormData)).rejects.toThrow(
        'NEXT_REDIRECT'
      );

      // The formState should have hasTimeout set to false
      expect(mockFormState.hasTimeout).toBe(false);
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

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result).toEqual(mockFormState);
      expect(mockUpdateUser).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('should return error when emails do not match', async () => {
      const mockFormState: FormState = {
        fields: { email: 'email1@example.com', confirmEmail: 'email2@example.com' },
        success: false,
        errors: { confirmEmail: ['Email addresses do not match'] },
      };

      const mockParsed = {
        success: false,
        error: {
          issues: [{ path: ['confirmEmail'], message: 'Email addresses do not match' }],
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result.errors?.confirmEmail).toEqual(['Email addresses do not match']);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  describe('authentication failures', () => {
    it('should return error when user is not authenticated', async () => {
      const mockFormState: FormState = {
        fields: { email: 'newemail@example.com', confirmEmail: 'newemail@example.com' },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { email: 'newemail@example.com', confirmEmail: 'newemail@example.com' },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue(null);

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['You must be logged in to change your email']);
      expect(mockUpdateUser).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('should return error when session has no user id', async () => {
      const mockFormState: FormState = {
        fields: { email: 'newemail@example.com', confirmEmail: 'newemail@example.com' },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { email: 'newemail@example.com', confirmEmail: 'newemail@example.com' },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { email: 'test@example.com' },
      });

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['You must be logged in to change your email']);
      expect(mockUpdateUser).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });

  describe('database errors', () => {
    beforeEach(() => {
      const mockFormState: FormState = {
        fields: {
          email: 'newemail@example.com',
          confirmEmail: 'newemail@example.com',
          previousEmail: 'oldemail@example.com',
        },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          email: 'newemail@example.com',
          confirmEmail: 'newemail@example.com',
          previousEmail: 'oldemail@example.com',
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123', email: 'oldemail@example.com' },
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

      vi.mocked(mockUpdateUser).mockRejectedValue(duplicateEmailError);

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.email).toEqual(['Email address is already in use']);
      expect(mockSignOut).not.toHaveBeenCalled();
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('should handle timeout errors with ETIMEOUT in message', async () => {
      const timeoutError = new Error('Connection ETIMEOUT');
      vi.mocked(mockUpdateUser).mockRejectedValue(timeoutError);

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('should handle timeout errors with "timeout" in message', async () => {
      const timeoutError = new Error('Connection timeout exceeded');
      vi.mocked(mockUpdateUser).mockRejectedValue(timeoutError);

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
    });

    it('should handle timeout errors with "timed out" in message', async () => {
      const timeoutError = new Error('Operation timed out');
      vi.mocked(mockUpdateUser).mockRejectedValue(timeoutError);

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
    });

    it('should handle timeout errors with ETIMEOUT error code', async () => {
      const timeoutError = Object.assign(new Error('Network timeout'), { code: 'ETIMEOUT' });
      vi.mocked(mockUpdateUser).mockRejectedValue(timeoutError);

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
    });

    it('should handle unknown Prisma errors with P2002 but different target', async () => {
      const unknownError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '4.0.0',
        meta: { target: 'User_username_key' },
      });

      vi.mocked(mockUpdateUser).mockRejectedValue(unknownError);

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(expect.any(Object));
      expect(mockSignOut).not.toHaveBeenCalled();
    });

    it('should handle other Prisma errors', async () => {
      const unknownError = new Prisma.PrismaClientKnownRequestError('Database error', {
        code: 'P1000',
        clientVersion: '4.0.0',
      });

      vi.mocked(mockUpdateUser).mockRejectedValue(unknownError);

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle general errors', async () => {
      const generalError = new Error('Something went wrong');
      vi.mocked(mockUpdateUser).mockRejectedValue(generalError);

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle non-Error thrown values', async () => {
      vi.mocked(mockUpdateUser).mockRejectedValue('string error');

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe('signOut errors', () => {
    it('should handle signOut failures gracefully', async () => {
      const mockFormState: FormState = {
        fields: {
          email: 'newemail@example.com',
          confirmEmail: 'newemail@example.com',
          previousEmail: 'oldemail@example.com',
        },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          email: 'newemail@example.com',
          confirmEmail: 'newemail@example.com',
          previousEmail: 'oldemail@example.com',
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123', email: 'oldemail@example.com' },
      });

      vi.mocked(mockUpdateUser).mockResolvedValue({
        id: 'user-123',
        email: 'newemail@example.com',
      });

      vi.mocked(mockSignOut).mockRejectedValue(new Error('SignOut failed'));

      // The action should throw when signOut fails
      await expect(changeEmailAction(mockInitialState, mockFormData)).rejects.toThrow(
        'SignOut failed'
      );

      // Even if signOut fails, updateUser should have been called
      expect(mockUpdateUser).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should preserve form state fields when returning errors', async () => {
      const mockFormState: FormState = {
        fields: { email: 'newemail@example.com', confirmEmail: 'different@example.com' },
        success: false,
        errors: { confirmEmail: ['Email addresses do not match'] },
      };

      const mockParsed = {
        success: false,
        error: { issues: [] },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result.fields).toEqual({
        email: 'newemail@example.com',
        confirmEmail: 'different@example.com',
      });
      expect(result.errors).toEqual({ confirmEmail: ['Email addresses do not match'] });
    });

    it('should call setUnknownError in finally block when errors exist but success is false', async () => {
      const mockFormState: FormState = {
        fields: {
          email: 'newemail@example.com',
          confirmEmail: 'newemail@example.com',
          previousEmail: 'oldemail@example.com',
        },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          email: 'newemail@example.com',
          confirmEmail: 'newemail@example.com',
          previousEmail: 'oldemail@example.com',
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123', email: 'oldemail@example.com' },
      });

      const duplicateError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '4.0.0',
        meta: { target: 'User_email_key' },
      });

      vi.mocked(mockUpdateUser).mockRejectedValue(duplicateError);

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.email).toEqual(['Email address is already in use']);
      expect(mockSetUnknownError).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle empty email strings', async () => {
      const mockFormState: FormState = {
        fields: { email: '', confirmEmail: '' },
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

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('should not redirect when email update fails', async () => {
      const mockFormState: FormState = {
        fields: { email: 'newemail@example.com' },
        success: false,
        errors: { confirmEmail: ['Confirmation required'] },
      };

      const mockParsed = {
        success: false,
        error: { issues: [] },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await changeEmailAction(mockInitialState, mockFormData);

      expect(result).toEqual(mockFormState);
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });
});
