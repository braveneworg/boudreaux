// Get the mocked functions using hoisted
const mockAuth = vi.hoisted(() => vi.fn());
const mockGetActionState = vi.hoisted(() => vi.fn());
const mockSetUnknownError = vi.hoisted(() => vi.fn());
const mockPrismaUserUpdate = vi.hoisted(() => vi.fn());
const mockRevalidatePath = vi.hoisted(() => vi.fn());

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

// Mock dependencies
vi.mock('/Users/cchaos/projects/braveneworg/boudreaux/auth.ts', () => ({
  auth: mockAuth,
}));

vi.mock('../prisma', () => ({
  prisma: {
    user: {
      update: mockPrismaUserUpdate,
    },
  },
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

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('@/app/lib/validation/profile-schema');

import { updateProfileAction } from '@/app/lib/actions/update-profile-action';
import type { FormState } from '@/app/lib/types/form-state';
import { Prisma } from '@prisma/client';

describe('updateProfileAction', () => {
  const mockFormData = new FormData();
  const mockInitialState: FormState = {
    errors: {},
    fields: {},
    success: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFormData.set('firstName', 'John');
    mockFormData.set('lastName', 'Doe');
    mockFormData.set('phone', '555-1234');
    mockFormData.set('addressLine1', '123 Main St');
    mockFormData.set('addressLine2', 'Apt 4');
    mockFormData.set('city', 'New York');
    mockFormData.set('state', 'NY');
    mockFormData.set('zipCode', '10001');
    mockFormData.set('country', 'US');
    mockFormData.set('allowSmsNotifications', 'true');
  });

  describe('successful profile update flow', () => {
    it('should update profile when data is valid and user is authenticated', async () => {
      const mockFormState: FormState = {
        fields: {
          firstName: 'John',
          lastName: 'Doe',
          phone: '555-1234',
          addressLine1: '123 Main St',
          addressLine2: 'Apt 4',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
          allowSmsNotifications: true,
        },
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          firstName: 'John',
          lastName: 'Doe',
          phone: '555-1234',
          addressLine1: '123 Main St',
          addressLine2: 'Apt 4',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
          allowSmsNotifications: true,
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123', email: 'test@example.com' },
      });

      vi.mocked(mockPrismaUserUpdate).mockResolvedValue({
        id: 'user-123',
        name: 'John Doe',
        firstName: 'John',
        lastName: 'Doe',
        phone: '555-1234',
      });

      const result = await updateProfileAction(mockInitialState, mockFormData);

      expect(mockPrismaUserUpdate).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: {
          name: 'John Doe',
          firstName: 'John',
          lastName: 'Doe',
          phone: '555-1234',
          addressLine1: '123 Main St',
          addressLine2: 'Apt 4',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
          country: 'US',
          allowSmsNotifications: true,
        },
      });

      expect(result.success).toBe(true);
      expect(mockRevalidatePath).toHaveBeenCalledWith('/profile');
    });

    it('should combine first and last name into fullName', async () => {
      const mockFormState: FormState = {
        fields: {
          firstName: 'Jane',
          lastName: 'Smith',
        },
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          firstName: 'Jane',
          lastName: 'Smith',
          phone: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
          allowSmsNotifications: false,
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123' },
      });

      vi.mocked(mockPrismaUserUpdate).mockResolvedValue({});

      await updateProfileAction(mockInitialState, mockFormData);

      expect(mockPrismaUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Jane Smith',
          }),
        })
      );
    });

    it('should handle empty first name', async () => {
      const mockFormState: FormState = {
        fields: {
          firstName: '',
          lastName: 'Doe',
        },
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          firstName: '',
          lastName: 'Doe',
          phone: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
          allowSmsNotifications: false,
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123' },
      });

      vi.mocked(mockPrismaUserUpdate).mockResolvedValue({});

      await updateProfileAction(mockInitialState, mockFormData);

      expect(mockPrismaUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Doe',
          }),
        })
      );
    });

    it('should handle empty last name', async () => {
      const mockFormState: FormState = {
        fields: {
          firstName: 'John',
          lastName: '',
        },
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          firstName: 'John',
          lastName: '',
          phone: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
          allowSmsNotifications: false,
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123' },
      });

      vi.mocked(mockPrismaUserUpdate).mockResolvedValue({});

      await updateProfileAction(mockInitialState, mockFormData);

      expect(mockPrismaUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'John',
          }),
        })
      );
    });

    it('should revalidate profile path after successful update', async () => {
      const mockFormState: FormState = {
        fields: {},
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          firstName: 'John',
          lastName: 'Doe',
          phone: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
          allowSmsNotifications: false,
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123' },
      });

      vi.mocked(mockPrismaUserUpdate).mockResolvedValue({});

      await updateProfileAction(mockInitialState, mockFormData);

      expect(mockRevalidatePath).toHaveBeenCalledWith('/profile');
      expect(mockRevalidatePath).toHaveBeenCalledTimes(1);
    });

    it('should handle all optional fields', async () => {
      const mockFormState: FormState = {
        fields: {},
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          firstName: 'John',
          lastName: 'Doe',
          phone: '555-5555',
          addressLine1: '456 Oak St',
          addressLine2: 'Suite 100',
          city: 'Boston',
          state: 'MA',
          zipCode: '02101',
          country: 'US',
          allowSmsNotifications: true,
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123' },
      });

      vi.mocked(mockPrismaUserUpdate).mockResolvedValue({});

      await updateProfileAction(mockInitialState, mockFormData);

      expect(mockPrismaUserUpdate).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: expect.objectContaining({
          phone: '555-5555',
          addressLine1: '456 Oak St',
          addressLine2: 'Suite 100',
          city: 'Boston',
          state: 'MA',
          zipCode: '02101',
          country: 'US',
          allowSmsNotifications: true,
        }),
      });
    });
  });

  describe('authentication errors', () => {
    it('should return error when user is not authenticated', async () => {
      const mockFormState: FormState = {
        fields: {},
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          firstName: 'John',
          lastName: 'Doe',
          phone: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
          allowSmsNotifications: false,
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue(null);

      const result = await updateProfileAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['You must be logged in to update your profile']);
      expect(mockPrismaUserUpdate).not.toHaveBeenCalled();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('should return error when session exists but user ID is missing', async () => {
      const mockFormState: FormState = {
        fields: {},
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          firstName: 'John',
          lastName: 'Doe',
          phone: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
          allowSmsNotifications: false,
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: undefined },
      });

      const result = await updateProfileAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['You must be logged in to update your profile']);
      expect(mockPrismaUserUpdate).not.toHaveBeenCalled();
    });

    it('should return error when session exists but user is undefined', async () => {
      const mockFormState: FormState = {
        fields: {},
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          firstName: 'John',
          lastName: 'Doe',
          phone: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
          allowSmsNotifications: false,
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: undefined,
      });

      const result = await updateProfileAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['You must be logged in to update your profile']);
    });
  });

  describe('validation errors', () => {
    it('should return formState when validation fails', async () => {
      const mockFormState: FormState = {
        fields: {},
        success: false,
        errors: {
          firstName: ['First name is required'],
        },
      };

      const mockParsed = {
        success: false,
        error: {
          issues: [
            {
              path: ['firstName'],
              message: 'First name is required',
            },
          ],
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      const result = await updateProfileAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(mockAuth).not.toHaveBeenCalled();
      expect(mockPrismaUserUpdate).not.toHaveBeenCalled();
    });

    it('should not call database when parsed data is invalid', async () => {
      const mockFormState: FormState = {
        fields: {},
        success: false,
        errors: {
          phone: ['Invalid phone number'],
        },
      };

      const mockParsed = {
        success: false,
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      await updateProfileAction(mockInitialState, mockFormData);

      expect(mockPrismaUserUpdate).not.toHaveBeenCalled();
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });

  describe('database errors', () => {
    it('should handle Prisma known request errors', async () => {
      const mockFormState: FormState = {
        fields: {},
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          firstName: 'John',
          lastName: 'Doe',
          phone: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
          allowSmsNotifications: false,
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123' },
      });

      const prismaError = new Prisma.PrismaClientKnownRequestError('Database error', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });

      vi.mocked(mockPrismaUserUpdate).mockRejectedValue(prismaError);

      const result = await updateProfileAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(mockFormState);
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it('should handle generic database errors', async () => {
      const mockFormState: FormState = {
        fields: {},
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          firstName: 'John',
          lastName: 'Doe',
          phone: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
          allowSmsNotifications: false,
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123' },
      });

      vi.mocked(mockPrismaUserUpdate).mockRejectedValue(new Error('Database connection failed'));

      const result = await updateProfileAction(mockInitialState, mockFormData);

      expect(result.success).toBe(false);
      expect(mockSetUnknownError).toHaveBeenCalledWith(mockFormState);
    });

    it('should not revalidate path when update fails', async () => {
      const mockFormState: FormState = {
        fields: {},
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          firstName: 'John',
          lastName: 'Doe',
          phone: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
          allowSmsNotifications: false,
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123' },
      });

      vi.mocked(mockPrismaUserUpdate).mockRejectedValue(new Error('Update failed'));

      await updateProfileAction(mockInitialState, mockFormData);

      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty string values', async () => {
      const mockFormState: FormState = {
        fields: {},
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          firstName: '',
          lastName: '',
          phone: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
          allowSmsNotifications: false,
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123' },
      });

      vi.mocked(mockPrismaUserUpdate).mockResolvedValue({});

      await updateProfileAction(mockInitialState, mockFormData);

      expect(mockPrismaUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: '',
            firstName: '',
            lastName: '',
          }),
        })
      );
    });

    it('should trim whitespace from name combination', async () => {
      const mockFormState: FormState = {
        fields: {},
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          firstName: '  John  ',
          lastName: '  Doe  ',
          phone: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
          allowSmsNotifications: false,
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123' },
      });

      vi.mocked(mockPrismaUserUpdate).mockResolvedValue({});

      await updateProfileAction(mockInitialState, mockFormData);

      expect(mockPrismaUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'John     Doe',
          }),
        })
      );
    });

    it('should handle allowSmsNotifications as boolean', async () => {
      const mockFormState: FormState = {
        fields: {},
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          firstName: 'John',
          lastName: 'Doe',
          phone: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
          allowSmsNotifications: true,
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123' },
      });

      vi.mocked(mockPrismaUserUpdate).mockResolvedValue({});

      await updateProfileAction(mockInitialState, mockFormData);

      expect(mockPrismaUserUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            allowSmsNotifications: true,
          }),
        })
      );
    });
  });

  describe('permitted fields', () => {
    it('should only process permitted fields', async () => {
      const mockFormState: FormState = {
        fields: {
          firstName: 'John',
          lastName: 'Doe',
        },
        success: false,
        errors: {},
      };

      const mockParsed = {
        success: true,
        data: {
          firstName: 'John',
          lastName: 'Doe',
          phone: '',
          addressLine1: '',
          addressLine2: '',
          city: '',
          state: '',
          zipCode: '',
          country: '',
          allowSmsNotifications: false,
        },
      };

      vi.mocked(mockGetActionState).mockReturnValue({
        formState: mockFormState,
        parsed: mockParsed,
      });

      vi.mocked(mockAuth).mockResolvedValue({
        user: { id: 'user-123' },
      });

      vi.mocked(mockPrismaUserUpdate).mockResolvedValue({});

      await updateProfileAction(mockInitialState, mockFormData);

      // Verify getActionState was called with correct permitted fields
      expect(mockGetActionState).toHaveBeenCalledWith(
        mockFormData,
        [
          'firstName',
          'lastName',
          'phone',
          'addressLine1',
          'addressLine2',
          'city',
          'state',
          'zipCode',
          'country',
          'allowSmsNotifications',
        ],
        expect.anything()
      );
    });
  });
});
