/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock all external dependencies to avoid complex setup
vi.mock('@/app/lib/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

vi.mock('react-hook-form', () => ({
  FormProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="form">{children}</div>,
  useFormContext: () => ({
    register: () => ({}),
    control: {},
    formState: { errors: {} },
    getFieldState: () => ({ error: undefined }),
  }),
  useFormState: () => ({ errors: {} }),
  Controller: ({ render, name }: any) => {
    const field = { value: '', onChange: vi.fn(), onBlur: vi.fn(), name, ref: vi.fn() };
    return render({ field, formState: { error: undefined } });
  },
  useForm: () => ({
    register: () => ({}),
    handleSubmit: (fn: any) => (e: any) => { e?.preventDefault?.(); fn({}); },
    watch: () => ({}),
    setValue: vi.fn(),
    control: {},
    formState: { errors: {} },
  }),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    useActionState: () => [{}, vi.fn(), false],
    useTransition: () => [false, vi.fn()],
    useState: (initial: any) => [initial, vi.fn()],
  };
});

// Mock all UI components
vi.mock('@/app/components/forms/ui/button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('@/app/components/forms/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

vi.mock('@/app/components/forms/ui/checkbox', () => ({
  Checkbox: ({ onCheckedChange, checked, ...props }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      {...props}
    />
  ),
}));

vi.mock('@/app/components/forms/ui/card', () => ({
  Card: ({ children }: any) => <div>{children}</div>,
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardDescription: ({ children }: any) => <p>{children}</p>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h2>{children}</h2>,
}));

vi.mock('@/app/components/forms/ui/alert', () => ({
  Alert: ({ children }: any) => <div>{children}</div>,
  AlertDescription: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/app/components/forms/ui/popover', () => ({
  Popover: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div>{children}</div>,
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/app/components/forms/ui/command', () => ({
  Command: ({ children }: any) => <div>{children}</div>,
  CommandEmpty: ({ children }: any) => <div>{children}</div>,
  CommandGroup: ({ children }: any) => <div>{children}</div>,
  CommandInput: (props: any) => <input {...props} />,
  CommandItem: ({ children, onSelect }: any) => (
    <button onClick={onSelect}>{children}</button>
  ),
  CommandList: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('lucide-react', () => ({
  Check: () => <span>✓</span>,
  ChevronsUpDown: () => <span>↕</span>,
  AlertCircle: () => <span>⚠</span>,
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
      }
    },
    status: 'authenticated'
  })
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    useActionState: () => [{}, vi.fn(), false],
    useTransition: () => [false, vi.fn()],
    useState: (initial: any) => {
      // Handle specific state variables that affect loading
      if (initial === true) return [false, vi.fn()]; // isLoading should be false
      if (initial === false) return [true, vi.fn()]; // areFormValuesSet should be true
      return [initial, vi.fn()];
    },
  };
});

vi.mock('@/app/lib/actions/update-profile-action', () => ({
  updateProfileAction: vi.fn(),
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

describe('ProfileForm', () => {
  it('renders without crashing', () => {
    render(<ProfileForm />);
    expect(screen.getByTestId('form')).toBeInTheDocument();
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
});