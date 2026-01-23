import { useActionState, useTransition } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSession } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import type { FormState } from '@/lib/types/form-state';

import ArtistForm from './artist-form';

vi.mock('server-only', () => ({}));

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useActionState: vi.fn(),
    useTransition: vi.fn(),
  };
});

vi.mock('next-auth/react');
vi.mock('react-hook-form', async () => {
  const actual = await vi.importActual('react-hook-form');
  return {
    ...actual,
    useForm: vi.fn(),
    useWatch: vi.fn(() => ''),
  };
});
vi.mock('sonner');
vi.mock('@/lib/actions/create-artist-action');

// TODO: These tests have broken react-hook-form mocking that needs to be fixed
// The mocked control object doesn't properly implement the Control interface
describe.skip('ArtistForm', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      email: 'test@example.com',
      role: 'admin',
    },
  };

  const mockFormMethods = {
    control: {},
    handleSubmit: vi.fn((fn) => (e: Event) => {
      e.preventDefault();
      fn({
        firstName: 'John',
        surname: 'Doe',
        slug: 'john-doe',
        middleName: '',
        displayName: '',
        title: '',
        suffix: '',
        akaNames: '',
        bio: '',
        shortBio: '',
        altBio: '',
        genres: '',
        tags: '',
        bornOn: '',
        diedOn: '',
        createdBy: 'user-123',
      });
    }),
    reset: vi.fn(),
    formState: { isDirty: true, errors: {} },
    getValues: vi.fn(),
    setValue: vi.fn(),
    clearErrors: vi.fn(),
  };

  const initialFormState: FormState = {
    fields: {},
    success: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useSession).mockReturnValue({
      data: mockSession,
      status: 'authenticated',
      update: vi.fn(),
    } as never);

    vi.mocked(useForm).mockReturnValue(mockFormMethods as never);

    vi.mocked(useTransition).mockReturnValue([false, vi.fn()] as never);

    vi.mocked(useActionState).mockReturnValue([initialFormState, vi.fn(), false] as never);
  });

  describe('Rendering', () => {
    it('should render loading state when form control is not initialized', () => {
      vi.mocked(useForm).mockReturnValue({
        ...mockFormMethods,
        control: null,
      } as never);

      render(<ArtistForm />);

      expect(screen.getByText('Create New Artist')).toBeInTheDocument();
      expect(screen.getByText('Loading form...')).toBeInTheDocument();
    });

    it('should render form when control is initialized', () => {
      render(<ArtistForm />);

      expect(screen.getByText('Create New Artist')).toBeInTheDocument();
      expect(screen.getByText(/Add a new artist to the system/)).toBeInTheDocument();
    });

    it('should render all required form sections', () => {
      render(<ArtistForm />);

      expect(screen.getByText('Name Information')).toBeInTheDocument();
      expect(screen.getByText('Biography')).toBeInTheDocument();
      expect(screen.getByText('Music Information')).toBeInTheDocument();
      expect(screen.getByText('Important Dates')).toBeInTheDocument();
    });

    it('should render all name fields', () => {
      render(<ArtistForm />);

      expect(screen.getByLabelText('Title')).toBeInTheDocument();
      expect(screen.getByLabelText('First Name *')).toBeInTheDocument();
      expect(screen.getByLabelText('Middle Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Surname *')).toBeInTheDocument();
      expect(screen.getByLabelText('Suffix')).toBeInTheDocument();
      expect(screen.getByLabelText('Display Name')).toBeInTheDocument();
      expect(screen.getByLabelText('AKA Names')).toBeInTheDocument();
      expect(screen.getByLabelText('Slug *')).toBeInTheDocument();
    });

    it('should render biography fields', () => {
      render(<ArtistForm />);

      expect(screen.getByLabelText('Bio')).toBeInTheDocument();
      expect(screen.getByLabelText('Short Bio')).toBeInTheDocument();
      expect(screen.getByLabelText('Alternative Bio')).toBeInTheDocument();
    });

    it('should render music information fields', () => {
      render(<ArtistForm />);

      expect(screen.getByLabelText('Genres')).toBeInTheDocument();
      expect(screen.getByLabelText('Tags')).toBeInTheDocument();
    });

    it('should render date fields', () => {
      render(<ArtistForm />);

      expect(screen.getByLabelText('Date of Birth')).toBeInTheDocument();
      expect(screen.getByLabelText('Date of Death')).toBeInTheDocument();
    });

    it('should render submit button', () => {
      render(<ArtistForm />);

      expect(screen.getByRole('button', { name: 'Create Artist' })).toBeInTheDocument();
    });

    it('should not render cancel button', () => {
      render(<ArtistForm />);

      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should call form action on submit', async () => {
      const user = userEvent.setup();
      const mockFormAction = vi.fn();
      const mockStartTransition = vi.fn((callback) => callback());

      vi.mocked(useActionState).mockReturnValue([initialFormState, mockFormAction, false] as never);

      vi.mocked(useTransition).mockReturnValue([false, mockStartTransition] as never);

      render(<ArtistForm />);

      const submitButton = screen.getByRole('button', { name: 'Create Artist' });
      await user.click(submitButton);

      expect(mockFormMethods.handleSubmit).toHaveBeenCalled();
      expect(mockStartTransition).toHaveBeenCalled();
    });

    it('should disable submit button when submitting', () => {
      vi.mocked(useActionState).mockReturnValue([initialFormState, vi.fn(), true] as never);

      render(<ArtistForm />);

      const submitButton = screen.getByRole('button', { name: 'Creating...' });
      expect(submitButton).toBeDisabled();
    });

    it('should disable submit button during transition', () => {
      vi.mocked(useTransition).mockReturnValue([true, vi.fn()] as never);

      render(<ArtistForm />);

      const submitButton = screen.getByRole('button', { name: 'Creating...' });
      expect(submitButton).toBeDisabled();
    });
  });

  describe('Success Handling', () => {
    it('should show success toast on successful submission', async () => {
      const successState: FormState = {
        fields: {},
        success: true,
      };

      const { rerender } = render(<ArtistForm />);

      vi.mocked(useActionState).mockReturnValue([successState, vi.fn(), false] as never);

      rerender(<ArtistForm />);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          expect.stringContaining('has been created successfully')
        );
      });
    });

    it('should reset form on success', async () => {
      const successState: FormState = {
        fields: {},
        success: true,
      };

      const { rerender } = render(<ArtistForm />);

      vi.mocked(useActionState).mockReturnValue([successState, vi.fn(), false] as never);

      rerender(<ArtistForm />);

      await waitFor(() => {
        expect(mockFormMethods.reset).toHaveBeenCalled();
      });
    });

    it('should include artist name in success toast', async () => {
      const successState: FormState = {
        fields: {},
        success: true,
      };

      mockFormMethods.handleSubmit = vi.fn((fn) => (e: Event) => {
        e.preventDefault();
        fn({
          firstName: 'John',
          surname: 'Doe',
          slug: 'john-doe',
          displayName: 'Johnny Doe',
          middleName: '',
          title: '',
          suffix: '',
          akaNames: '',
          bio: '',
          shortBio: '',
          altBio: '',
          genres: '',
          tags: '',
          bornOn: '',
          diedOn: '',
          createdBy: 'user-123',
        });
      });

      const user = userEvent.setup();
      const { rerender } = render(<ArtistForm />);

      const submitButton = screen.getByRole('button', { name: 'Create Artist' });
      await user.click(submitButton);

      vi.mocked(useActionState).mockReturnValue([successState, vi.fn(), false] as never);

      rerender(<ArtistForm />);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Johnny Doe'));
      });
    });

    it('should use concatenated name when displayName is empty', async () => {
      const successState: FormState = {
        fields: {},
        success: true,
      };

      mockFormMethods.handleSubmit = vi.fn((fn) => (e: Event) => {
        e.preventDefault();
        fn({
          firstName: 'John',
          middleName: 'M',
          surname: 'Doe',
          slug: 'john-doe',
          displayName: '',
          title: '',
          suffix: '',
          akaNames: '',
          bio: '',
          shortBio: '',
          altBio: '',
          genres: '',
          tags: '',
          bornOn: '',
          diedOn: '',
          createdBy: 'user-123',
        });
      });

      const user = userEvent.setup();
      const { rerender } = render(<ArtistForm />);

      const submitButton = screen.getByRole('button', { name: 'Create Artist' });
      await user.click(submitButton);

      vi.mocked(useActionState).mockReturnValue([successState, vi.fn(), false] as never);

      rerender(<ArtistForm />);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('John M Doe'));
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error toast on submission failure', async () => {
      const errorState: FormState = {
        fields: {},
        success: false,
        errors: { general: ['Artist creation failed'] },
      };

      const { rerender } = render(<ArtistForm />);

      vi.mocked(useActionState).mockReturnValue([errorState, vi.fn(), false] as never);

      rerender(<ArtistForm />);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to create artist. Please try again.');
      });
    });

    it('should not reset form on failure', async () => {
      const errorState: FormState = {
        fields: {},
        success: false,
        errors: { general: ['Artist creation failed'] },
      };

      const { rerender } = render(<ArtistForm />);

      mockFormMethods.reset.mockClear();

      vi.mocked(useActionState).mockReturnValue([errorState, vi.fn(), false] as never);

      rerender(<ArtistForm />);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });

      expect(mockFormMethods.reset).not.toHaveBeenCalled();
    });
  });

  describe('Form Data Preparation', () => {
    it('should only append non-empty values to FormData', async () => {
      const user = userEvent.setup();
      const mockFormAction = vi.fn();
      const mockStartTransition = vi.fn((callback) => callback());

      mockFormMethods.handleSubmit = vi.fn((fn) => (e: Event) => {
        e.preventDefault();
        fn({
          firstName: 'John',
          surname: 'Doe',
          slug: 'john-doe',
          middleName: '',
          displayName: '',
          title: '',
          suffix: '',
          akaNames: '',
          bio: '',
          shortBio: '',
          altBio: '',
          genres: '',
          tags: '',
          bornOn: '',
          diedOn: '',
          createdBy: 'user-123',
        });
      });

      vi.mocked(useActionState).mockReturnValue([initialFormState, mockFormAction, false] as never);

      vi.mocked(useTransition).mockReturnValue([false, mockStartTransition] as never);

      render(<ArtistForm />);

      const submitButton = screen.getByRole('button', { name: 'Create Artist' });
      await user.click(submitButton);

      expect(mockFormAction).toHaveBeenCalled();
      const formData = mockFormAction.mock.calls[0][0] as FormData;

      // Check that only non-empty values were appended
      expect(formData.get('firstName')).toBe('John');
      expect(formData.get('surname')).toBe('Doe');
      expect(formData.get('slug')).toBe('john-doe');
      expect(formData.get('createdBy')).toBe('user-123');
    });
  });

  describe('Loading States', () => {
    it('should not show toasts while pending', () => {
      const successState: FormState = {
        fields: {},
        success: true,
      };

      vi.mocked(useActionState).mockReturnValue([successState, vi.fn(), true] as never);

      render(<ArtistForm />);

      expect(toast.success).not.toHaveBeenCalled();
    });

    it('should not show toasts during transition', () => {
      const successState: FormState = {
        fields: {},
        success: true,
      };

      vi.mocked(useActionState).mockReturnValue([successState, vi.fn(), false] as never);
      vi.mocked(useTransition).mockReturnValue([true, vi.fn()] as never);

      render(<ArtistForm />);

      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe('Session Handling', () => {
    it('should use user ID from session for createdBy field', () => {
      render(<ArtistForm />);

      expect(useForm).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultValues: expect.objectContaining({
            createdBy: 'user-123',
          }),
        })
      );
    });

    it('should handle missing user session gracefully', () => {
      vi.mocked(useSession).mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: vi.fn(),
      } as never);

      render(<ArtistForm />);

      expect(useForm).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultValues: expect.objectContaining({
            createdBy: undefined,
          }),
        })
      );
    });
  });
});
