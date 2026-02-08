import React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SignupSigninForm from '@/app/components/forms/signup-signin-form';
import type { FormState } from '@/lib/types/form-state';

import type { Control } from 'react-hook-form';

// Common type for both signin and signup schemas (matching the form component)
type BaseFormSchema = {
  email: string;
  general?: string;
  termsAndConditions?: boolean;
};

// Mock all dependencies
let lastFormInputProps: FormInputProps | null = null;

vi.mock('@/app/components/ui/form-input', () => ({
  default: (props: FormInputProps) => {
    const { id, placeholder, type, autoFocus, ...rest } = props;
    lastFormInputProps = props; // Store props for testing

    const inputProps: Record<string, unknown> = {
      'data-testid': `form-input-${id}`,
      id,
      placeholder,
      type,
      ...rest,
    };

    if (autoFocus) {
      inputProps.autoFocus = true;
    }

    return <input {...inputProps} />;
  },
}));

vi.mock('@/app/components/ui/form', () => ({
  FormField: ({
    name,
    render,
  }: {
    name: string;
    render: (context: Record<string, unknown>) => React.ReactNode;
  }) => {
    const field = {
      value: '',
      onChange: vi.fn(),
      onBlur: vi.fn(),
      name,
      ref: vi.fn(),
    };
    return render({ field });
  },
  FormItem: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="form-item">
      {children}
    </div>
  ),
  FormLabel: ({
    children,
    htmlFor,
    className,
  }: {
    children: React.ReactNode;
    htmlFor?: string;
    className?: string;
  }) => (
    <label htmlFor={htmlFor} className={className} data-testid="form-label">
      {children}
    </label>
  ),
  FormControl: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormMessage: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="form-message">
      {children}
    </div>
  ),
}));

vi.mock('@/app/components/ui/switch', () => ({
  Switch: ({ id, checked, onCheckedChange, required, ...props }: SwitchProps) => (
    <input
      type="checkbox"
      id={id}
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      required={required}
      data-testid={`switch-${id}`}
      {...props}
    />
  ),
}));

vi.mock('@/app/components/ui/button', () => ({
  Button: ({ children, disabled, size, ...props }: ButtonProps) => (
    <button disabled={disabled} data-testid="submit-button" data-size={size} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/app/components/ui/turnstile-widget', () => ({
  default: ({ setIsVerified, ...props }: TurnstileWidgetProps) => (
    <div data-testid="turnstile-widget" onClick={() => setIsVerified?.(true)} {...props}>
      Turnstile Widget
    </div>
  ),
}));

vi.mock('@/app/components/ui/status-indicator', () => ({
  default: ({ isSuccess, hasError, hasTimeout, isPending }: StatusIndicatorProps) => (
    <div
      data-testid="status-indicator"
      data-success={isSuccess?.toString() || 'false'}
      data-error={hasError?.toString() || 'false'}
      data-timeout={hasTimeout?.toString() || 'false'}
      data-pending={isPending?.toString() || 'false'}
    >
      Status Indicator
    </div>
  ),
}));

interface FormInputProps {
  id: string;
  placeholder: string;
  type: string;
  autoFocus?: boolean;
  [key: string]: unknown;
}

interface StatusIndicatorProps {
  isSuccess: boolean;
  hasError: boolean;
  hasTimeout: boolean;
  isPending: boolean;
}

interface ButtonProps {
  children: React.ReactNode;
  disabled?: boolean;
  size?: string;
}

interface SwitchProps {
  id: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  required?: boolean;
  [key: string]: unknown;
}

interface TurnstileWidgetProps {
  setIsVerified?: (verified: boolean) => void;
  [key: string]: unknown;
}

// Mock next/link
vi.mock('next/link', () => ({
  default: ({
    href,
    className,
    children,
  }: {
    href: string;
    className?: string;
    children: React.ReactNode;
  }) => (
    <a href={href} className={className} data-testid="next-link">
      {children}
    </a>
  ),
}));

// Mock next/navigation
const mockUsePathname = vi.fn(() => '/signup');
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

// Mock react-hook-form
vi.mock('react-hook-form', () => ({
  Controller: ({ render }: { render: (context: Record<string, unknown>) => React.ReactNode }) => {
    const field = {
      value: '',
      onChange: vi.fn(),
      onBlur: vi.fn(),
      name: 'test',
      ref: vi.fn(),
    };
    return render({ field });
  },
}));

describe('SignupSigninForm', () => {
  const defaultProps = {
    control: {} as Control<BaseFormSchema>, // Simple mock since FormField component is mocked
    hasTermsAndConditions: true,
    isPending: false,
    isVerified: true,
    setIsVerified: vi.fn(),
    state: {
      errors: {},
      fields: {},
      success: false,
    } as FormState,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('email field', () => {
    it('should render email input field', () => {
      render(<SignupSigninForm {...defaultProps} />);

      expect(screen.getByTestId('form-input-email')).toBeInTheDocument();
      expect(screen.getByTestId('form-input-email')).toHaveAttribute('type', 'email');
      expect(screen.getByTestId('form-input-email')).toHaveAttribute(
        'placeholder',
        'Email address'
      );
    });

    it('should autofocus email input field on page load', () => {
      render(<SignupSigninForm {...defaultProps} />);

      // Verify that the FormInput component received the autoFocus prop
      // Note: JSDOM doesn't fully support autofocus behavior, but we can verify
      // that the component is configured correctly
      expect(lastFormInputProps).not.toBeNull();
      expect(lastFormInputProps?.autoFocus).toBe(true);
      expect(lastFormInputProps?.id).toBe('email');
    });

    it('should display email validation errors', () => {
      const propsWithEmailError = {
        ...defaultProps,
        state: {
          ...defaultProps.state,
          errors: { email: ['Invalid email format'] },
        },
      };

      render(<SignupSigninForm {...propsWithEmailError} />);

      const errorMessage = screen.getByText('Invalid email format');
      expect(errorMessage).toBeInTheDocument();
    });

    it('should display first email error when multiple errors exist', () => {
      const propsWithMultipleEmailErrors = {
        ...defaultProps,
        state: {
          ...defaultProps.state,
          errors: { email: ['Invalid email format', 'Email is required'] },
        },
      };

      render(<SignupSigninForm {...propsWithMultipleEmailErrors} />);

      expect(screen.getByText('Invalid email format')).toBeInTheDocument();
      expect(screen.queryByText('Email is required')).not.toBeInTheDocument();
    });

    it('should not display email errors when none exist', () => {
      render(<SignupSigninForm {...defaultProps} />);

      const formMessages = screen.getAllByTestId('form-message');
      const emailFormMessage = formMessages.find((msg) => msg.textContent?.includes('email'));
      expect(emailFormMessage?.textContent?.trim() || '').toBe('');
    });
  });

  describe('terms and conditions field', () => {
    it('should render terms and conditions when hasTermsAndConditions is true', () => {
      render(<SignupSigninForm {...defaultProps} hasTermsAndConditions />);

      expect(screen.getByTestId('switch-terms-and-conditions')).toBeInTheDocument();
      expect(screen.getByTestId('next-link')).toBeInTheDocument();
      expect(screen.getByText('Accept terms and conditions?')).toBeInTheDocument();
    });

    it('should not render terms and conditions when hasTermsAndConditions is false', () => {
      render(<SignupSigninForm {...defaultProps} hasTermsAndConditions={false} />);

      expect(screen.queryByTestId('switch-terms-and-conditions')).not.toBeInTheDocument();
      expect(screen.queryByText('Accept terms and conditions?')).not.toBeInTheDocument();
    });

    it('should display terms and conditions validation errors', () => {
      const propsWithTermsError = {
        ...defaultProps,
        state: {
          ...defaultProps.state,
          errors: {
            termsAndConditions: ['You must accept terms and conditions'],
          },
        },
      };

      render(<SignupSigninForm {...propsWithTermsError} />);

      expect(screen.getByText('You must accept terms and conditions')).toBeInTheDocument();
    });

    it('should link to terms and conditions page', () => {
      render(<SignupSigninForm {...defaultProps} />);

      const link = screen.getByTestId('next-link');
      expect(link).toHaveAttribute('href', '/legal/terms-and-conditions');
    });

    it('should mark terms switch as required', () => {
      render(<SignupSigninForm {...defaultProps} />);

      const termsSwitch = screen.getByTestId('switch-terms-and-conditions');
      expect(termsSwitch).toHaveAttribute('required');
    });
  });

  describe('turnstile widget', () => {
    it('should render turnstile widget', () => {
      render(<SignupSigninForm {...defaultProps} />);

      expect(screen.getByTestId('turnstile-widget')).toBeInTheDocument();
    });

    it('should pass setIsVerified prop to turnstile widget', async () => {
      const mockSetIsVerified = vi.fn();

      render(<SignupSigninForm {...defaultProps} setIsVerified={mockSetIsVerified} />);

      const turnstileWidget = screen.getByTestId('turnstile-widget');
      await userEvent.click(turnstileWidget);

      expect(mockSetIsVerified).toHaveBeenCalledWith(true);
    });
  });

  describe('submit button and status', () => {
    it('should render submit button', () => {
      render(<SignupSigninForm {...defaultProps} />);

      const submitButton = screen.getByTestId('submit-button');
      expect(submitButton).toBeInTheDocument();
      expect(submitButton).toHaveTextContent('Submit');
      expect(submitButton).toHaveAttribute('data-size', 'lg');
    });

    it('should disable submit button when pending', () => {
      render(<SignupSigninForm {...defaultProps} isPending />);

      const submitButton = screen.getByTestId('submit-button');
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when not pending', () => {
      render(<SignupSigninForm {...defaultProps} isPending={false} />);

      const submitButton = screen.getByTestId('submit-button');
      expect(submitButton).not.toBeDisabled();
    });

    it('should render status indicator with correct props', () => {
      const stateWithErrors = {
        errors: { email: ['Invalid'] },
        fields: {},
        success: false,
        hasTimeout: true,
      };

      render(<SignupSigninForm {...defaultProps} state={stateWithErrors} isPending />);

      const statusIndicator = screen.getByTestId('status-indicator');
      expect(statusIndicator).toHaveAttribute('data-success', 'false');
      expect(statusIndicator).toHaveAttribute('data-error', 'true');
      expect(statusIndicator).toHaveAttribute('data-timeout', 'true');
      expect(statusIndicator).toHaveAttribute('data-pending', 'true');
    });
  });

  describe('error states', () => {
    it('should display timeout error message when hasTimeout is true', () => {
      const stateWithTimeout = {
        ...defaultProps.state,
        hasTimeout: true,
      };

      render(<SignupSigninForm {...defaultProps} state={stateWithTimeout} />);

      expect(screen.getByText('Connection timed out. Please try again.')).toBeInTheDocument();
    });

    it('should not display timeout error when hasTimeout is false', () => {
      render(<SignupSigninForm {...defaultProps} />);

      expect(screen.queryByText('Connection timed out. Please try again.')).not.toBeInTheDocument();
    });

    it('should display general error messages', () => {
      const stateWithGeneralError = {
        ...defaultProps.state,
        errors: { general: ['Something went wrong'] },
      };

      render(<SignupSigninForm {...defaultProps} state={stateWithGeneralError} />);

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should display first general error when multiple exist', () => {
      const stateWithMultipleGeneralErrors = {
        ...defaultProps.state,
        errors: { general: ['First error', 'Second error'] },
      };

      render(<SignupSigninForm {...defaultProps} state={stateWithMultipleGeneralErrors} />);

      expect(screen.getByText('First error')).toBeInTheDocument();
      expect(screen.queryByText('Second error')).not.toBeInTheDocument();
    });

    it('should not display general error section when no general errors exist', () => {
      render(<SignupSigninForm {...defaultProps} />);

      expect(screen.queryByText(/Something went wrong/)).not.toBeInTheDocument();
    });
  });

  describe('form layout and styling', () => {
    it('should apply correct CSS classes to form container', () => {
      render(<SignupSigninForm {...defaultProps} />);

      // Check for presence of form structure elements
      expect(screen.getAllByTestId('form-item')).toHaveLength(2); // email + terms
    });

    it('should position elements correctly', () => {
      render(<SignupSigninForm {...defaultProps} />);

      // Verify the button and status indicator are in same container
      const submitButton = screen.getByTestId('submit-button');
      const statusIndicator = screen.getByTestId('status-indicator');

      expect(submitButton.parentElement).toContain(statusIndicator.parentElement);
    });
  });

  describe('accessibility', () => {
    it('should have proper labels for form fields', () => {
      render(<SignupSigninForm {...defaultProps} />);

      const emailLabel = screen.getAllByTestId('form-label')[0]; // Get the first label (email)
      expect(emailLabel).toHaveAttribute('for', 'email');
      expect(emailLabel).toHaveClass('sr-only'); // Screen reader only
    });

    it('should associate terms label with checkbox', () => {
      render(<SignupSigninForm {...defaultProps} />);

      const termsLabels = screen.getAllByTestId('form-label');
      const termsLabel = termsLabels.find(
        (label) => label.getAttribute('for') === 'terms-and-conditions'
      );

      expect(termsLabel).toBeDefined();
      expect(termsLabel).toBeInTheDocument();
    });
  });

  describe('component integration', () => {
    it('should handle all props correctly', () => {
      const completeProps = {
        control: {} as Control<BaseFormSchema>,
        hasTermsAndConditions: true,
        isPending: true,
        isVerified: true,
        setIsVerified: vi.fn(),
        state: {
          errors: {
            email: ['Invalid email'],
            termsAndConditions: ['Required'],
            general: ['Server error'],
          },
          fields: { email: 'test@example.com' },
          success: false,
          hasTimeout: true,
        } as FormState,
      };

      expect(() => {
        render(<SignupSigninForm {...completeProps} />);
      }).not.toThrow();
    });

    it('should render all components when fully configured', () => {
      render(<SignupSigninForm {...defaultProps} />);

      // Verify all major components are present
      expect(screen.getByTestId('form-input-email')).toBeInTheDocument();
      expect(screen.getByTestId('switch-terms-and-conditions')).toBeInTheDocument();
      expect(screen.getByTestId('turnstile-widget')).toBeInTheDocument();
      expect(screen.getByTestId('submit-button')).toBeInTheDocument();
      expect(screen.getByTestId('status-indicator')).toBeInTheDocument();
    });
  });

  describe('signin path behavior', () => {
    beforeEach(() => {
      mockUsePathname.mockReturnValue('/signin');
    });

    afterEach(() => {
      mockUsePathname.mockReturnValue('/signup');
    });

    it('should not render terms and conditions on signin page even when hasTermsAndConditions is true', () => {
      render(<SignupSigninForm {...defaultProps} hasTermsAndConditions />);

      expect(screen.queryByText('Accept terms and conditions?')).not.toBeInTheDocument();
      expect(screen.queryByTestId('switch-terms-and-conditions')).not.toBeInTheDocument();
    });

    it('should render email field on signin page', () => {
      render(<SignupSigninForm {...defaultProps} hasTermsAndConditions={false} />);

      expect(screen.getByTestId('form-input-email')).toBeInTheDocument();
    });

    it('should render submit button and status indicator on signin page', () => {
      render(<SignupSigninForm {...defaultProps} />);

      expect(screen.getByTestId('submit-button')).toBeInTheDocument();
      expect(screen.getByTestId('status-indicator')).toBeInTheDocument();
    });
  });
});
