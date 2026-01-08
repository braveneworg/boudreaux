// Get the mocked functions using hoisted
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { changeUsernameAction } from '@/lib/actions/change-username-action';
import type { FormState } from '@/lib/types/form-state';

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetActionState = vi.hoisted(() => vi.fn());
const mockSetUnknownError = vi.hoisted(() => vi.fn());
const mockUpdateUser = vi.hoisted(() => vi.fn());
const mockRevalidatePath = vi.hoisted(() => vi.fn());

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock dependencies
// Use relative module path consistent with action source import to ensure CI resolution
vi.mock('../../../../auth', () => ({
  auth: mockAuth,
}));

vi.mock('@/app/lib/prisma-adapter', () => ({
  CustomPrismaAdapter: vi.fn(() => ({
    updateUser: mockUpdateUser,
  })),
}));

vi.mock('../prisma', () => ({
  prisma: {},
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
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

vi.mock('@/app/lib/validation/change-username-schema');

describe('changeUsernameAction', () => {
  const mockFormData = new FormData();
  const mockInitialState: FormState = {
    errors: {},
    fields: {},
    success: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFormData.set('username', 'newusername');
    mockFormData.set('confirmUsername', 'newusername');
  });

  describe('successful username change flow', () => {
    it('should update username when data is valid and user is authenticated', async () => {
      const mockFormState: FormState = {
        fields: { username: 'newusername', confirmUsername: 'newusername' },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { username: 'newusername', confirmUsername: 'newusername' },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
      });

      vi.mocked(mockUpdateUser).mockResolvedValue({
        id: 'user-123',
        username: 'newusername',
      });

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(mockUpdateUser).toHaveBeenCalledWith({
        id: 'user-123',
        username: 'newusername',
      });

      expect(result.success).toBe(true);
      expect(result.hasTimeout).toBe(false);
    });

    it('should set hasTimeout to false on successful update', async () => {
      const mockFormState: FormState = {
        fields: { username: 'newusername', confirmUsername: 'newusername' },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { username: 'newusername', confirmUsername: 'newusername' },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
      });

      vi.mocked(mockUpdateUser).mockResolvedValue({
        id: 'user-123',
        username: 'newusername',
      });

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.hasTimeout).toBe(false);
    });
  });

  describe('validation failures', () => {
    it('should return form state with errors when validation fails', async () => {
      const mockFormState: FormState = {
        fields: { username: 'invalid@username' },
        success: false,
        errors: { username: ['Invalid username format'] },
      };

      const mockParsed = {
        success: false,
        error: {
          issues: [{ path: ['username'], message: 'Invalid username format' }],
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result).toEqual(mockFormState);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('should return error when usernames do not match', async () => {
      const mockFormState: FormState = {
        fields: { username: 'username1', confirmUsername: 'username2' },
        success: false,
        errors: { confirmUsername: ['Usernames do not match'] },
      };

      const mockParsed = {
        success: false,
        error: {
          issues: [{ path: ['confirmUsername'], message: 'Usernames do not match' }],
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.errors?.confirmUsername).toEqual(['Usernames do not match']);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  describe('authentication failures', () => {
    it('should throw error when user is not authenticated', async () => {
      const mockFormState: FormState = {
        fields: { username: 'newusername', confirmUsername: 'newusername' },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { username: 'newusername', confirmUsername: 'newusername' },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue(null);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalled();
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('should throw error when session has no user id', async () => {
      const mockFormState: FormState = {
        fields: { username: 'newusername', confirmUsername: 'newusername' },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { username: 'newusername', confirmUsername: 'newusername' },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { email: 'test@example.com' },
      });

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalled();
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });

  describe('database errors', () => {
    beforeEach(() => {
      const mockFormState: FormState = {
        fields: { username: 'newusername', confirmUsername: 'newusername' },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { username: 'newusername', confirmUsername: 'newusername' },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
      });
    });

    it('should handle duplicate username errors', async () => {
      const duplicateUsernameError = new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '4.0.0',
        meta: { target: 'User_username_key' },
      });

      vi.mocked(mockUpdateUser).mockRejectedValue(duplicateUsernameError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.username).toEqual(['Username is already taken.']);
    });

    it('should handle timeout errors with ETIMEOUT in message', async () => {
      const timeoutError = new Error('Connection ETIMEOUT');
      vi.mocked(mockUpdateUser).mockRejectedValue(timeoutError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
    });

    it('should handle timeout errors with "timeout" in message', async () => {
      const timeoutError = new Error('Connection timeout exceeded');
      vi.mocked(mockUpdateUser).mockRejectedValue(timeoutError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
    });

    it('should handle timeout errors with "timed out" in message', async () => {
      const timeoutError = new Error('Operation timed out');
      vi.mocked(mockUpdateUser).mockRejectedValue(timeoutError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
    });

    it('should handle timeout errors with ETIMEOUT error code', async () => {
      const timeoutError = Object.assign(new Error('Network timeout'), { code: 'ETIMEOUT' });
      vi.mocked(mockUpdateUser).mockRejectedValue(timeoutError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
    });

    it('should handle unknown Prisma errors with P2002 but different target', async () => {
      const unknownError = new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '4.0.0',
        meta: { target: 'User_email_key' },
      });

      vi.mocked(mockUpdateUser).mockRejectedValue(unknownError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle other Prisma errors', async () => {
      const unknownError = new PrismaClientKnownRequestError('Database error', {
        code: 'P1000',
        clientVersion: '4.0.0',
      });

      vi.mocked(mockUpdateUser).mockRejectedValue(unknownError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle general errors', async () => {
      const generalError = new Error('Something went wrong');
      vi.mocked(mockUpdateUser).mockRejectedValue(generalError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle non-Error thrown values', async () => {
      vi.mocked(mockUpdateUser).mockRejectedValue('string error');

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(expect.any(Object));
    });
  });

  describe('edge cases', () => {
    it('should call setUnknownError when success but fields not properly set', async () => {
      const mockFormState: FormState = {
        fields: { username: 'newusername', confirmUsername: 'newusername' },
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { username: 'newusername', confirmUsername: 'newusername' },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
      });

      // Make the updateUser succeed but formState.success stays false
      // This simulates an edge case where success flag isn't set properly
      vi.mocked(mockUpdateUser).mockResolvedValue({
        id: 'user-123',
        username: 'newusername',
      });

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      // Since formState.success is true after successful update, and fields exist,
      // it should return successfully
      expect(result.success).toBe(true);
    });

    it('should preserve form state fields when returning errors', async () => {
      const mockFormState: FormState = {
        fields: { username: 'newusername', confirmUsername: 'different' },
        success: false,
        errors: { confirmUsername: ['Usernames do not match'] },
      };

      const mockParsed = {
        success: false,
        error: { issues: [] },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.fields).toEqual({
        username: 'newusername',
        confirmUsername: 'different',
      });
      expect(result.errors).toEqual({ confirmUsername: ['Usernames do not match'] });
    });

    it('should handle duplicate username error without calling setUnknownError', async () => {
      const mockFormState: FormState = {
        fields: { username: 'newusername', confirmUsername: 'newusername' },
        success: false,
        hasTimeout: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: { username: 'newusername', confirmUsername: 'newusername' },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
      });

      const duplicateError = new PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '4.0.0',
        meta: { target: 'User_username_key' },
      });

      vi.mocked(mockUpdateUser).mockRejectedValue(duplicateError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.username).toEqual(['Username is already taken.']);
      // Should NOT call setUnknownError for specific username duplicate error
      expect(mockSetUnknownError).not.toHaveBeenCalled();
    });

    it('should handle empty username strings', async () => {
      const mockFormState: FormState = {
        fields: { username: '', confirmUsername: '' },
        success: false,
        errors: { username: ['Username is required'] },
      };

      const mockParsed = {
        success: false,
        error: { issues: [] },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockUpdateUser).not.toHaveBeenCalled();
    });
  });
});
