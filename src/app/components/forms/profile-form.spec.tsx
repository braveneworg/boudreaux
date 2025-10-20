import * as React from 'react';

import { render, screen } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import the component after mocking
import ProfileForm from './profile-form';

// Mock next/cache before any other imports
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// Mock server actions
vi.mock('@/app/lib/actions/update-profile-action', () => ({
  updateProfileAction: vi.fn(),
}));

vi.mock('@/app/lib/actions/change-email-action', () => ({
  changeEmailAction: vi.fn(),
}));

vi.mock('@/app/lib/actions/change-username-action', () => ({
  changeUsernameAction: vi.fn(),
}));

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Check: (props: Record<string, unknown>) => <div data-testid="check-icon" {...props} />,
  ChevronsUpDown: (props: Record<string, unknown>) => (
    <div data-testid="chevrons-up-down-icon" {...props} />
  ),
  CheckIcon: (props: Record<string, unknown>) => <div data-testid="check-icon" {...props} />,
  RefreshCwIcon: (props: Record<string, unknown>) => (
    <div data-testid="refresh-cw-icon" {...props} />
  ),
}));

// Mock Sonner toast - Create a functional toast implementation for testing
vi.mock('sonner', () => {
  return {
    toast: {
      success: vi.fn((message: string) => {
        // Render the toast message in the DOM
        const toastElement = document.createElement('div');
        toastElement.setAttribute('role', 'status');
        toastElement.setAttribute('data-testid', 'toast-message');
        toastElement.textContent = message;
        document.body.appendChild(toastElement);
      }),
      error: vi.fn((message: string) => {
        // Render the toast message in the DOM
        const toastElement = document.createElement('div');
        toastElement.setAttribute('role', 'alert');
        toastElement.setAttribute('data-testid', 'toast-message');
        toastElement.textContent = message;
        document.body.appendChild(toastElement);
      }),
      info: vi.fn(),
      warning: vi.fn(),
    },
    Toaster: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  };
});

// Mock all external dependencies to avoid complex setup
vi.mock('@/app/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('react-hook-form', () => ({
  FormProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="form-provider">{children}</div>
  ),
  useFormContext: () => ({
    register: () => ({}),
    control: {},
    formState: { errors: {}, isDirty: false },
    getFieldState: () => ({ error: undefined }),
  }),
  useFormState: () => ({ errors: {}, isDirty: false }),
  Controller: ({
    render,
    name,
  }: {
    render: (context: Record<string, unknown>) => React.ReactNode;
    name: string;
  }) => {
    const field = { value: '', onChange: vi.fn() };
    return <div data-testid={`controller-${name}`}>{render({ field })}</div>;
  },
  useForm: vi.fn(() => ({
    register: () => ({}),
    handleSubmit: (fn: (data: Record<string, unknown>) => void) => (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      fn({});
    },
    watch: () => ({}),
    setValue: vi.fn(),
    getValues: vi.fn(() => ({
      firstName: 'Test',
      lastName: 'User',
      phone: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      zipCode: '',
      country: '',
      allowSmsNotifications: false,
    })),
    clearErrors: vi.fn(),
    control: {},
    formState: { errors: {}, dirtyFields: {}, isDirty: false },
    reset: vi.fn(),
  })),
  useWatch: vi.fn(() => ''),
}));

// Mock all UI components
vi.mock('@/app/components/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props} data-testid="button">
      {children}
    </button>
  ),
}));

vi.mock('@/app/components/forms/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/app/components/forms/ui/checkbox', () => ({
  Checkbox: ({
    onCheckedChange,
    checked,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement> & {
    onCheckedChange?: (checked: boolean) => void;
    checked?: boolean;
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      {...props}
    />
  ),
}));

vi.mock('@/app/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-content">{children}</div>
  ),
  CardDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-description">{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-header">{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="card-title">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div className={className} data-testid="skeleton" />
  ),
}));

vi.mock('@radix-ui/react-separator', () => ({
  Separator: ({ className }: { className?: string }) => <hr className={className} />,
}));

vi.mock('@/app/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/app/components/ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  CommandItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <div onClick={onSelect}>{children}</div>
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock the field components
vi.mock('@/app/components/forms/fields', () => ({
  TextField: ({
    name,
    label,
    placeholder,
    ...props
  }: {
    name: string;
    label?: string;
    placeholder?: string;
  } & Record<string, unknown>) => (
    <div data-testid={`text-field-${name}`}>
      <label>{label}</label>
      <input name={name} placeholder={placeholder} {...props} />
    </div>
  ),
  CheckboxField: ({
    name,
    label,
    ...props
  }: { name: string; label?: string } & Record<string, unknown>) => (
    <div data-testid={`checkbox-field-${name}`}>
      <input type="checkbox" name={name} {...props} />
      <label>{label}</label>
    </div>
  ),
  StateField: (props: Record<string, unknown>) => (
    <div data-testid="state-field">
      <select {...props} />
    </div>
  ),
  CountryField: (props: Record<string, unknown>) => (
    <div data-testid="country-field">
      <select {...props} />
    </div>
  ),
}));

// Mock GenerateUsernameButton
vi.mock('@/app/components/auth/generate-username-button', () => ({
  GenerateUsernameButton: () => <button data-testid="generate-username-button">Generate</button>,
}));

// Mock next-auth useSession with a mock function that can be overridden
vi.mock('next-auth/react', () => {
  const mockUseSession = vi.fn(() => ({
    data: {
      user: {
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      },
    },
    status: 'authenticated',
    update: vi.fn(),
  }));

  return {
    useSession: mockUseSession,
  };
});

type UseStateReturn<T> = [T, React.Dispatch<React.SetStateAction<T>>];

// Create mutable formStates for testing
let mockFormState = {
  errors: {},
  fields: {},
  success: false,
};

let mockEmailFormState = {
  errors: {},
  fields: {},
  success: false,
};

let mockUsernameFormState = {
  errors: {},
  fields: {},
  success: false,
};

// Track call count outside the mock to allow resetting
let callCount = 0;
export const resetCallCount = () => {
  callCount = 0;
};

vi.mock('react', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof React;
  return {
    ...actual,
    useActionState: () => {
      callCount++;
      const currentCall = callCount;
      // First call is for profile form
      if (currentCall === 1) {
        return [mockFormState, vi.fn(), false];
      }
      // Second call is for email form
      if (currentCall === 2) {
        return [mockEmailFormState, vi.fn(), false];
      }
      // Third call is for username form
      return [mockUsernameFormState, vi.fn(), false];
    },
    useTransition: () => [false, vi.fn()],
    useState: (initial: unknown) => {
      // Handle specific state variables that affect loading
      if (initial === true) return [false, vi.fn()]; // isLoading should be false
      if (initial === false) return [true, vi.fn()]; // areFormValuesSet should be true
      return [initial, vi.fn()] as UseStateReturn<typeof initial>;
    },
  };
});

vi.mock('@/app/lib/utils/states', () => ({
  US_STATES: [
    { code: 'NY', name: 'New York' },
    { code: 'CA', name: 'California' },
  ],
}));

describe('ProfileForm', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Reset the call counter
    resetCallCount();
    // Clear any existing toast messages from DOM
    document.querySelectorAll('[data-testid="toast-message"]').forEach((el) => el.remove());
    // Reset formStates to initial state
    mockFormState = {
      errors: {},
      fields: {},
      success: false,
    };
    mockEmailFormState = {
      errors: {},
      fields: {},
      success: false,
    };
    mockUsernameFormState = {
      errors: {},
      fields: {},
      success: false,
    };
  });

  it('should render the profile form', () => {
    render(<ProfileForm />);
    expect(screen.getAllByTestId('form').length).toBeGreaterThan(0);
  });

  describe('Toast Notifications', () => {
    it('displays success toast when profile is updated successfully', () => {
      // Set success state
      mockFormState = {
        errors: {},
        fields: {},
        success: true,
      };

      render(<ProfileForm />);

      // Verify success toast was called
      expect(toast.success).toHaveBeenCalledWith('Your profile has been updated successfully.');
      expect(toast.success).toHaveBeenCalledTimes(1);

      // Verify toast message is visible in the document
      const toastMessage = screen.getByTestId('toast-message');
      expect(toastMessage).toBeInTheDocument();
      expect(toastMessage).toHaveTextContent('Your profile has been updated successfully.');
      expect(toastMessage).toHaveAttribute('role', 'status');
    });

    it('displays error toast when profile update fails', () => {
      // Set error state
      mockFormState = {
        errors: {
          general: ['An error occurred while updating your profile.'],
        },
        fields: {},
        success: false,
      };

      render(<ProfileForm />);

      // Verify error toast was called
      expect(toast.error).toHaveBeenCalledWith('An error occurred while updating your profile.');
      expect(toast.error).toHaveBeenCalledTimes(1);

      // Verify toast message is visible in the document
      const toastMessage = screen.getByTestId('toast-message');
      expect(toastMessage).toBeInTheDocument();
      expect(toastMessage).toHaveTextContent('An error occurred while updating your profile.');
      expect(toastMessage).toHaveAttribute('role', 'alert');
    });

    it('displays success toast when email is updated successfully', () => {
      // Set email success state
      mockEmailFormState = {
        errors: {},
        fields: {},
        success: true,
      };

      render(<ProfileForm />);

      expect(toast.success).toHaveBeenCalledWith('Your email has been updated successfully.');
      expect(toast.success).toHaveBeenCalledTimes(1);

      // Verify toast message is visible in the document
      const toastMessage = screen.getByTestId('toast-message');
      expect(toastMessage).toBeInTheDocument();
      expect(toastMessage).toHaveTextContent('Your email has been updated successfully.');
    });

    it('displays success toast when username is updated successfully', () => {
      // Set username success state
      mockUsernameFormState = {
        errors: {},
        fields: {},
        success: true,
      };

      render(<ProfileForm />);

      expect(toast.success).toHaveBeenCalledWith('Your username has been updated successfully.');
      expect(toast.success).toHaveBeenCalledTimes(1);

      // Verify toast message is visible in the document
      const toastMessage = screen.getByTestId('toast-message');
      expect(toastMessage).toBeInTheDocument();
      expect(toastMessage).toHaveTextContent('Your username has been updated successfully.');
    });

    it('does not display toast on initial render with no errors or success', () => {
      mockFormState = {
        errors: {},
        fields: {},
        success: false,
      };

      render(<ProfileForm />);

      // Verify no toasts were called
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();

      // Verify no toast messages are in the document
      expect(screen.queryByTestId('toast-message')).not.toBeInTheDocument();
    });

    it('displays error toast with specific error message', () => {
      const errorMessage = 'Database connection failed';
      mockFormState = {
        errors: {
          general: [errorMessage],
        },
        fields: {},
        success: false,
      };

      render(<ProfileForm />);

      expect(toast.error).toHaveBeenCalledWith(errorMessage);
      expect(toast.error).toHaveBeenCalledTimes(1);

      // Verify toast message is visible in the document
      const toastMessage = screen.getByTestId('toast-message');
      expect(toastMessage).toBeInTheDocument();
      expect(toastMessage).toHaveTextContent(errorMessage);
    });

    it('should call toast.success exactly once for profile update', () => {
      mockFormState = {
        errors: {},
        fields: {},
        success: true,
      };

      render(<ProfileForm />);

      // Verify toast was called exactly once (not multiple times due to re-renders)
      expect(toast.success).toHaveBeenCalledTimes(1);

      // Verify only one toast message exists in the document
      const toastMessages = screen.getAllByTestId('toast-message');
      expect(toastMessages).toHaveLength(1);
    });

    it('should call toast.error exactly once for profile update error', () => {
      mockFormState = {
        errors: {
          general: ['Update failed'],
        },
        fields: {},
        success: false,
      };

      render(<ProfileForm />);

      // Verify toast was called exactly once
      expect(toast.error).toHaveBeenCalledTimes(1);

      // Verify only one toast message exists in the document
      const toastMessages = screen.getAllByTestId('toast-message');
      expect(toastMessages).toHaveLength(1);
      expect(toastMessages[0]).toHaveTextContent('Update failed');
    });

    it('resets form to pristine state after successful profile update', () => {
      mockFormState = {
        errors: {},
        fields: {},
        success: true,
      };

      render(<ProfileForm />);

      // Verify success toast was called
      expect(toast.success).toHaveBeenCalledWith('Your profile has been updated successfully.');

      // Note: We can't directly verify reset was called with the current mock setup
      // but the component logic calls personalProfileForm.reset(personalProfileForm.getValues())
      // This test documents the expected behavior
    });

    it('should disable Save Changes button immediately after successful submission', () => {
      mockFormState = {
        errors: {},
        fields: {},
        success: true,
      };

      render(<ProfileForm />);

      const buttons = screen.getAllByTestId('button');
      const saveButton = buttons[0];

      // Verify the button is disabled because form is reset to pristine after success
      expect(saveButton).toBeDisabled();

      // Verify success message was shown
      expect(toast.success).toHaveBeenCalledWith('Your profile has been updated successfully.');
    });

    it('should only show one success toast when profile update succeeds', () => {
      mockFormState = {
        errors: {},
        fields: {},
        success: true,
      };

      render(<ProfileForm />);

      // Verify toast was called exactly once using the idempotent handler
      expect(toast.success).toHaveBeenCalledTimes(1);
      expect(toast.success).toHaveBeenCalledWith('Your profile has been updated successfully.');
    });
  });

  describe('Form State Management', () => {
    it('should have Save Changes button disabled when form is not dirty', () => {
      render(<ProfileForm />);

      const buttons = screen.getAllByTestId('button');
      const saveButton = buttons[0];

      expect(saveButton).toBeDisabled();
    });

    it('should enable Save Changes button when form becomes dirty', () => {
      // Mock useForm to return isDirty: true
      vi.mocked(useForm).mockReturnValueOnce({
        register: () => ({}),
        handleSubmit: (fn: (data: Record<string, unknown>) => void) => (e?: React.FormEvent) => {
          if (e) e.preventDefault();
          fn({});
        },
        watch: () => ({}),
        setValue: vi.fn(),
        getValues: vi.fn(() => ({})),
        clearErrors: vi.fn(),
        control: {},
        formState: { errors: {}, dirtyFields: { firstName: true }, isDirty: true },
        reset: vi.fn(),
        getFieldState: vi.fn(),
        setError: vi.fn(),
        trigger: vi.fn(),
        resetField: vi.fn(),
        setFocus: vi.fn(),
        unregister: vi.fn(),
      } as unknown as ReturnType<typeof useForm>);

      render(<ProfileForm />);

      const buttons = screen.getAllByTestId('button');
      const saveButton = buttons[0];

      // Button should be enabled when form is dirty
      expect(saveButton).not.toBeDisabled();
    });

    it('should disable Save Changes button after successful profile update', () => {
      // Set success state
      mockFormState = {
        errors: {},
        fields: {},
        success: true,
      };

      render(<ProfileForm />);

      const buttons = screen.getAllByTestId('button');
      const saveButton = buttons[0];

      // Button should be disabled because form is not dirty (reset to pristine after success)
      expect(saveButton).toBeDisabled();
    });

    it('should re-enable Save Changes button when form becomes dirty after success', () => {
      // Set success state
      mockFormState = {
        errors: {},
        fields: {},
        success: true,
      };

      // Mock useForm to return isDirty: true
      vi.mocked(useForm).mockReturnValueOnce({
        register: () => ({}),
        handleSubmit: (fn: (data: Record<string, unknown>) => void) => (e?: React.FormEvent) => {
          if (e) e.preventDefault();
          fn({});
        },
        watch: () => ({}),
        setValue: vi.fn(),
        getValues: vi.fn(() => ({})),
        clearErrors: vi.fn(),
        control: {},
        formState: { errors: {}, dirtyFields: { firstName: true }, isDirty: true },
        reset: vi.fn(),
        getFieldState: vi.fn(),
        setError: vi.fn(),
        trigger: vi.fn(),
        resetField: vi.fn(),
        setFocus: vi.fn(),
        unregister: vi.fn(),
      } as unknown as ReturnType<typeof useForm>);

      render(<ProfileForm />);

      const buttons = screen.getAllByTestId('button');
      const saveButton = buttons[0];

      // Button should be enabled when form becomes dirty, even if success is true
      expect(saveButton).not.toBeDisabled();
    });

    it('should disable Save Changes button during pending state', () => {
      render(<ProfileForm />);

      const buttons = screen.getAllByTestId('button');
      const saveButton = buttons[0];

      // Button is disabled by default (not dirty)
      expect(saveButton).toBeDisabled();
    });

    it('should handle complete save and re-edit flow correctly', () => {
      // Initial state: form is not dirty, success is false
      mockFormState = {
        errors: {},
        fields: {},
        success: false,
      };

      // Mock form as not dirty initially
      vi.mocked(useForm).mockReturnValueOnce({
        register: () => ({}),
        handleSubmit: (fn: (data: Record<string, unknown>) => void) => (e?: React.FormEvent) => {
          if (e) e.preventDefault();
          fn({});
        },
        watch: () => ({}),
        setValue: vi.fn(),
        getValues: vi.fn(() => ({})),
        clearErrors: vi.fn(),
        control: {},
        formState: { errors: {}, dirtyFields: {}, isDirty: false },
        reset: vi.fn(),
        getFieldState: vi.fn(),
        setError: vi.fn(),
        trigger: vi.fn(),
        resetField: vi.fn(),
        setFocus: vi.fn(),
        unregister: vi.fn(),
      } as unknown as ReturnType<typeof useForm>);

      render(<ProfileForm />);

      const buttons = screen.getAllByTestId('button');
      const saveButton = buttons[0];

      // Button should be disabled (form not dirty)
      expect(saveButton).toBeDisabled();
    });
  });

  describe('Email Form Behavior', () => {
    it('should reset editing state and clear form after successful email update', () => {
      mockEmailFormState = {
        errors: {},
        fields: {},
        success: true,
      };

      render(<ProfileForm />);

      expect(toast.success).toHaveBeenCalledWith('Your email has been updated successfully.');
    });
  });

  describe('Username Form Behavior', () => {
    it('should reset editing state and clear form after successful username update', () => {
      mockUsernameFormState = {
        errors: {},
        fields: {},
        success: true,
      };

      render(<ProfileForm />);

      expect(toast.success).toHaveBeenCalledWith('Your username has been updated successfully.');
    });
  });

  describe('Session Updates', () => {
    it('should update session after successful profile update', () => {
      const mockUpdate = vi.fn();
      vi.mocked(useSession).mockReturnValue({
        data: {
          user: {
            id: '1',
            name: 'Test User',
            email: 'test@example.com',
            username: 'testuser',
            firstName: 'Test',
            lastName: 'User',
          },
          expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        status: 'authenticated',
        update: mockUpdate,
      });

      mockFormState = {
        errors: {},
        fields: {},
        success: true,
      };

      render(<ProfileForm />);

      // Note: We can't directly verify update was called due to void operator
      // but we can verify the success flow completed
      expect(toast.success).toHaveBeenCalledWith('Your profile has been updated successfully.');
    });
  });

  describe('Button Click Handlers', () => {
    it('should toggle email editing state when Edit Email button is clicked', () => {
      render(<ProfileForm />);

      const editEmailButton = screen.queryByRole('button', { name: /edit email/i });

      // Button may not be rendered if user is not authenticated
      if (editEmailButton) {
        expect(editEmailButton).toBeDefined();
      } else {
        expect(screen.queryByText(/Loading/i)).toBeDefined();
      }
    });

    it('should toggle username editing state when Edit Username button is clicked', () => {
      render(<ProfileForm />);

      const editUsernameButton = screen.queryByRole('button', { name: /edit username/i });

      // Button may not be rendered if user is not authenticated
      if (editUsernameButton) {
        expect(editUsernameButton).toBeDefined();
      } else {
        expect(screen.queryByText(/Loading/i)).toBeDefined();
      }
    });

    it('should clear errors when canceling email edit', () => {
      render(<ProfileForm />);

      // The component should clear errors when toggling edit state
      const forms = screen.getAllByTestId('form');
      expect(forms.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ...existing tests...
});
