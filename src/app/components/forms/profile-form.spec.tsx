import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Check: (props: Record<string, unknown>) => <div data-testid="check-icon" {...props} />,
  ChevronsUpDown: (props: Record<string, unknown>) => (
    <div data-testid="chevrons-up-down-icon" {...props} />
  ),
  CheckIcon: (props: Record<string, unknown>) => <div data-testid="check-icon" {...props} />,
}));

// Mock Sonner toast - using inline object creation to avoid hoisting issues
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
  Toaster: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

// Mock all external dependencies to avoid complex setup
vi.mock('@/app/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('react-hook-form', () => ({
  FormProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="form">{children}</div>
  ),
  useFormContext: () => ({
    register: () => ({}),
    control: {},
    formState: { errors: {} },
    getFieldState: () => ({ error: undefined }),
  }),
  useFormState: () => ({ errors: {} }),
  Controller: ({
    render,
    name,
  }: {
    render: (context: Record<string, unknown>) => React.ReactNode;
    name: string;
  }) => {
    const field = { value: '', onChange: vi.fn(), onBlur: vi.fn(), name, ref: vi.fn() };
    return render({ field, formState: { error: undefined } });
  },
  useForm: () => ({
    register: () => ({}),
    handleSubmit: (fn: (data: Record<string, unknown>) => void) => (e?: React.FormEvent) => {
      e?.preventDefault?.();
      fn({});
    },
    watch: () => ({}),
    setValue: vi.fn(),
    control: {},
    formState: { errors: {} },
  }),
}));

// Mock all UI components
vi.mock('@/app/components/forms/ui/button', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
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

vi.mock('@/app/components/forms/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/app/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div className={className}>Loading...</div>,
}));

vi.mock('@radix-ui/react-separator', () => ({
  Separator: ({ className }: { className?: string }) => <hr className={className} />,
}));

vi.mock('@/app/components/forms/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/app/components/forms/ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  CommandItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button onClick={onSelect}>{children}</button>
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock the field components we created
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
      <input placeholder={placeholder} {...props} />
    </div>
  ),
  CheckboxField: ({
    name,
    label,
    ...props
  }: { name: string; label?: string } & Record<string, unknown>) => (
    <div data-testid={`checkbox-field-${name}`}>
      <input type="checkbox" {...props} />
      <label>{label}</label>
    </div>
  ),
  StateField: (props: Record<string, unknown>) => (
    <div data-testid="state-field">
      <label>State</label>
      <select {...props}>
        <option value="">Select a state...</option>
      </select>
    </div>
  ),
  CountryField: (props: Record<string, unknown>) => (
    <div data-testid="country-field">
      <label>Country</label>
      <select {...props}>
        <option value="">Select a country...</option>
      </select>
    </div>
  ),
}));

// Mock next-auth useSession
vi.mock('next-auth/react', () => ({
  useSession: () => ({
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
  }),
}));

type UseStateReturn<T> = [T, React.Dispatch<React.SetStateAction<T>>];

// Create a mutable formState for testing
let mockFormState = {
  errors: {},
  fields: {},
  success: false,
};

// Helper to update formState during tests
export const setMockFormState = (state: typeof mockFormState) => {
  mockFormState = state;
};

vi.mock('react', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof React;
  return {
    ...actual,
    useActionState: () => [mockFormState, vi.fn(), false],
    useTransition: () => [false, vi.fn()],
    useState: (initial: unknown) => {
      // Handle specific state variables that affect loading
      if (initial === true) return [false, vi.fn()]; // isLoading should be false
      if (initial === false) return [true, vi.fn()]; // areFormValuesSet should be true
      return [initial, vi.fn()] as UseStateReturn<typeof initial>;
    },
  };
});

vi.mock('@/app/lib/actions/update-profile-action', () => ({
  updateProfileAction: vi.fn(),
}));

vi.mock('@/app/lib/actions/change-email-action', () => ({
  changeEmailAction: vi.fn(),
}));

vi.mock('@/app/lib/utils/profile-utils', () => ({
  splitFullName: (name: string) => ({
    firstName: name?.split(' ')[0] || '',
    lastName: name?.split(' ')[1] || '',
  }),
}));

vi.mock('@/app/lib/utils/countries', () => ({
  COUNTRIES: [
    { code: 'US', name: 'United States' },
    { code: 'CA', name: 'Canada' },
  ],
}));

vi.mock('@/app/lib/utils/states', () => ({
  US_STATES: [
    { code: 'NY', name: 'New York' },
    { code: 'CA', name: 'California' },
  ],
}));

// Import the component after mocking
import ProfileForm from './profile-form';
import { toast } from 'sonner';

describe('ProfileForm', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    // Reset formState to initial state
    mockFormState = {
      errors: {},
      fields: {},
      success: false,
    };
  });

  it('renders without crashing', () => {
    render(<ProfileForm />);
    // Check for the presence of both forms instead of using a generic selector
    expect(screen.getAllByTestId('form')).toHaveLength(2);
  });

  it('renders submit button', () => {
    render(<ProfileForm />);
    expect(screen.getByRole('button', { name: /update profile/i })).toBeInTheDocument();
  });

  it('renders form fields', () => {
    render(<ProfileForm />);

    // Check for some form inputs
    const inputs = screen.getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThan(0);
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
    });
  });
});
