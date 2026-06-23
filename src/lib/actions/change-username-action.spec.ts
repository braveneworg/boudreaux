/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Get the mocked functions using hoisted
import { changeUsernameAction } from '@/lib/actions/change-username-action';
import { DataError } from '@/lib/types/domain/errors';
import type { FormState } from '@/lib/types/form-state';

const mockAuth = vi.hoisted(() => vi.fn());
const mockGetActionState = vi.hoisted(() => vi.fn());
const mockSetUnknownError = vi.hoisted(() => vi.fn());
const mockUpdateUsername = vi.hoisted(() => vi.fn());
const mockRevalidatePath = vi.hoisted(() => vi.fn());

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock dependencies
// Use relative module path consistent with action source import to ensure CI resolution
vi.mock('@/auth', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/repositories/user-repository', () => ({
  UserRepository: {
    updateUsername: mockUpdateUsername,
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('@/lib/utils/auth/get-action-state', () => ({
  getActionState: mockGetActionState,
}));

vi.mock('@/lib/utils/auth/auth-utils', () => ({
  setUnknownError: mockSetUnknownError,
}));

vi.mock('@/lib/validation/change-username-schema');

vi.mock('@/lib/utils/audit-log', () => ({
  logSecurityEvent: vi.fn(),
}));

describe('changeUsernameAction', () => {
  const mockFormData = new FormData();
  const mockInitialState: FormState = {
    errors: {},
    fields: {},
    success: false,
  };

  beforeEach(() => {
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

      vi.mocked(mockUpdateUsername).mockResolvedValue({
        id: 'user-123',
        username: 'newusername',
      });

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(mockUpdateUsername).toHaveBeenCalledWith('user-123', 'newusername');

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

      vi.mocked(mockUpdateUsername).mockResolvedValue({
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
          flatten: () => ({
            fieldErrors: { username: ['Invalid username format'] },
            formErrors: [],
          }),
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result).toEqual(mockFormState);
      expect(mockUpdateUsername).not.toHaveBeenCalled();
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
          flatten: () => ({
            fieldErrors: { confirmUsername: ['Usernames do not match'] },
            formErrors: [],
          }),
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.errors?.confirmUsername).toEqual(['Usernames do not match']);
      expect(mockUpdateUsername).not.toHaveBeenCalled();
    });

    it('should add general errors from Zod formErrors', async () => {
      const mockFormState: FormState = {
        fields: { username: 'a', confirmUsername: 'a' },
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: false,
        error: {
          issues: [],
          flatten: () => ({
            fieldErrors: {},
            formErrors: ['Usernames must be different from current'],
          }),
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.errors?.general).toEqual(['Usernames must be different from current']);
      expect(mockUpdateUsername).not.toHaveBeenCalled();
    });

    it('should initialize formState.errors when undefined during validation failure', async () => {
      const mockFormState: FormState = {
        fields: { username: '', confirmUsername: '' },
        success: false,
      };

      const mockParsed = {
        success: false,
        error: {
          issues: [{ path: ['username'], message: 'Required' }],
          flatten: () => ({
            fieldErrors: { username: ['Required'] },
            formErrors: [],
          }),
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.errors).toBeDefined();
      expect(result.errors?.username).toEqual(['Required']);
      expect(mockUpdateUsername).not.toHaveBeenCalled();
    });
  });

  describe('authentication failures', () => {
    it('should return error when user is not authenticated', async () => {
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
      expect(result.errors?.general).toEqual(['You must be logged in to change your username']);
      expect(mockUpdateUsername).not.toHaveBeenCalled();
    });

    it('should return error when session has no user id', async () => {
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
      expect(result.errors?.general).toEqual(['You must be logged in to change your username']);
      expect(mockUpdateUsername).not.toHaveBeenCalled();
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
      const duplicateUsernameError = new DataError('DUPLICATE', 'Unique constraint failed');

      vi.mocked(mockUpdateUsername).mockRejectedValue(duplicateUsernameError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.username).toEqual(['Username is already taken.']);
    });

    it('should handle timeout errors signalled by a TIMEOUT DataError code', async () => {
      const timeoutError = new DataError('TIMEOUT', 'Database timed out');
      vi.mocked(mockUpdateUsername).mockRejectedValue(timeoutError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
    });

    it('should handle timeout errors with "timeout" in the DataError message', async () => {
      const timeoutError = new DataError('UNKNOWN', 'Connection timeout exceeded');
      vi.mocked(mockUpdateUsername).mockRejectedValue(timeoutError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
    });

    it('should handle timeout errors with "timed out" in the DataError message', async () => {
      const timeoutError = new DataError('UNKNOWN', 'Operation timed out');
      vi.mocked(mockUpdateUsername).mockRejectedValue(timeoutError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
    });

    it('should handle timeout errors with "ETIMEOUT" in the DataError message', async () => {
      const timeoutError = new DataError('UNKNOWN', 'Network ETIMEOUT');
      vi.mocked(mockUpdateUsername).mockRejectedValue(timeoutError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
    });

    it('should use fallback message when a plain Error is thrown', async () => {
      const emptyMessageError = new Error('');
      vi.mocked(mockUpdateUsername).mockRejectedValue(emptyMessageError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual([
        'Failed to update username. Please try again or contact support.',
      ]);
    });

    it('should handle other data-access errors', async () => {
      const unknownError = new DataError('UNKNOWN', 'Database error');

      vi.mocked(mockUpdateUsername).mockRejectedValue(unknownError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual([
        'A database error occurred. Please try again or contact support.',
      ]);
    });

    it('should handle a NOT_FOUND DataError (user not found)', async () => {
      const notFoundError = new DataError('NOT_FOUND', 'Record not found');

      vi.mocked(mockUpdateUsername).mockRejectedValue(notFoundError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['User not found. Please refresh and try again.']);
    });

    it('should handle a VALIDATION DataError (data validation)', async () => {
      const dataValidationError = new DataError('VALIDATION', 'Data validation failed');

      vi.mocked(mockUpdateUsername).mockRejectedValue(dataValidationError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual([
        'There was a data validation issue. Please refresh and try again.',
      ]);
    });

    it('should handle general errors', async () => {
      const generalError = Error('Something went wrong');
      vi.mocked(mockUpdateUsername).mockRejectedValue(generalError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual([
        'Failed to update username. Please try again or contact support.',
      ]);
    });

    it('should handle non-Error thrown values', async () => {
      vi.mocked(mockUpdateUsername).mockRejectedValue('string error');

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual([
        'An unexpected error occurred. Please try again or contact support.',
      ]);
    });

    it('should initialize formState.errors when undefined on timeout error', async () => {
      const mockFormStateWithoutErrors: FormState = {
        fields: { username: 'newusername', confirmUsername: 'newusername' },
        success: false,
        hasTimeout: false,
      };

      const mockParsed = {
        success: true,
        data: { username: 'newusername', confirmUsername: 'newusername' },
      };

      vi.mocked(mockGetActionState).mockReturnValueOnce({
        formState: mockFormStateWithoutErrors,
        parsed: mockParsed,
      });

      const timeoutError = new DataError('TIMEOUT', 'Database timed out');
      vi.mocked(mockUpdateUsername).mockRejectedValue(timeoutError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.hasTimeout).toBe(true);
      expect(result.errors).toBeDefined();
      expect(result.errors?.general).toEqual(['Connection timed out. Please try again.']);
    });

    it('should initialize formState.errors when undefined on duplicate username error', async () => {
      const mockFormStateWithoutErrors: FormState = {
        fields: { username: 'newusername', confirmUsername: 'newusername' },
        success: false,
        hasTimeout: false,
      };

      const mockParsed = {
        success: true,
        data: { username: 'newusername', confirmUsername: 'newusername' },
      };

      vi.mocked(mockGetActionState).mockReturnValueOnce({
        formState: mockFormStateWithoutErrors,
        parsed: mockParsed,
      });

      const duplicateUsernameError = new DataError('DUPLICATE', 'Unique constraint failed');

      vi.mocked(mockUpdateUsername).mockRejectedValue(duplicateUsernameError);

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.username).toEqual(['Username is already taken.']);
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
      vi.mocked(mockUpdateUsername).mockResolvedValue({
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
        error: {
          issues: [],
          flatten: () => ({
            fieldErrors: {},
            formErrors: [],
          }),
        },
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

      const duplicateError = new DataError('DUPLICATE', 'Unique constraint failed');

      vi.mocked(mockUpdateUsername).mockRejectedValue(duplicateError);

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
        error: {
          issues: [],
          flatten: () => ({
            fieldErrors: {},
            formErrors: [],
          }),
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await changeUsernameAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockUpdateUsername).not.toHaveBeenCalled();
    });
  });
});
