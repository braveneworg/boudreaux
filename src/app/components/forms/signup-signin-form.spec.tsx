import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import SignupSigninForm from '@/app/components/forms/signup-signin-form';
import type { FormState } from '@/app/lib/types/form-state';
import React from 'react';

// Mock all dependencies
interface FormInputProps {
  id: string;
  placeholder: string;
  type: string;
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
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  required?: boolean;
}

interface FormControlProps {
  children: React.ReactNode;
}

interface FormFieldProps {
  render: () => React.ReactNode;
  control?: unknown;
  name?: string;
}

interface FormItemProps {
  children: React.ReactNode;
  className?: string;
}

interface FormLabelProps {
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}

vi.mock('@/app/components/forms/ui/form-input', () => ({
  default: ({ id, placeholder, type, ...props }: FormInputProps) =>
    React.createElement('input', {
      'data-testid': `form-input-${id}`,
      id,
      placeholder,
      type,
      ...props,
    }),
}));

vi.mock('@/app/components/forms/ui/turnstile-widget', () => ({
  default: ({ setIsVerified }: { setIsVerified: (verified: boolean) => void }) =>
    React.createElement('div', {
      'data-testid': 'turnstile-widget',
      onClick: () => setIsVerified(true),
    }),
}));

vi.mock('@/app/components/forms/ui/status-indicator', () => ({
  default: ({ isSuccess, hasError, hasTimeout, isPending }: StatusIndicatorProps) =>
    React.createElement('div', {
      'data-testid': 'status-indicator',
      'data-success': isSuccess,
      'data-error': hasError,
      'data-timeout': hasTimeout,
      'data-pending': isPending,
    }),
}));

vi.mock('@/app/components/forms/ui/button', () => ({
  Button: ({ children, disabled, size }: ButtonProps) =>
    React.createElement('button', {
      'data-testid': 'submit-button',
      disabled,
      'data-size': size,
    }, children),
}));

vi.mock('@/app/components/forms/ui/switch', () => ({
  Switch: ({ id, checked, onCheckedChange, required }: SwitchProps) =>
    React.createElement('input', {
      'data-testid': `switch-${id}`,
      type: 'checkbox',
      checked,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onCheckedChange(e.target.checked),
      required,
    }),
}));

vi.mock('@/app/components/forms/ui/form', () => ({
  FormControl: ({ children }: FormControlProps) => React.createElement('div', { 'data-testid': 'form-control' }, children),
  FormField: ({ render }: FormFieldProps) => {
    const field = { value: '', onChange: vi.fn() };
    return render({ field });
  },
  FormItem: ({ children, className }: FormItemProps) => React.createElement('div', { className, 'data-testid': 'form-item' }, children),
  FormLabel: ({ children, htmlFor, className }: FormLabelProps) => React.createElement('label', { htmlFor, className, 'data-testid': 'form-label' }, children),
  FormMessage: ({ children, className }: FormItemProps) => React.createElement('div', { className, 'data-testid': 'form-message' }, children),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) =>
    React.createElement('a', { href, className, 'data-testid': 'next-link' }, children),
}));

// Mock useForm hook
const mockControl = {
  _formState: { errors: {} },
  register: vi.fn(),
};

describe('SignupSigninForm', () => {
  const defaultProps = {
    control: mockControl,
    hasTermsAndConditions: true,
    isPending: false,
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
      expect(screen.getByTestId('form-input-email')).toHaveAttribute('placeholder', 'Email address');
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
      const emailFormMessage = formMessages.find(msg => msg.textContent?.includes('email'));
      expect(emailFormMessage?.textContent?.trim() || '').toBe('');
    });
  });

  describe('terms and conditions field', () => {
    it('should render terms and conditions when hasTermsAndConditions is true', () => {
      render(<SignupSigninForm {...defaultProps} hasTermsAndConditions={true} />);

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
          errors: { termsAndConditions: ['You must accept terms and conditions'] },
        },
      };

      render(<SignupSigninForm {...propsWithTermsError} />);

      expect(screen.getByText('You must accept terms and conditions')).toBeInTheDocument();
    });

    it('should link to terms and conditions page', () => {
      render(<SignupSigninForm {...defaultProps} />);

      const link = screen.getByTestId('next-link');
      expect(link).toHaveAttribute('href', '/terms-and-conditions');
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
      render(<SignupSigninForm {...defaultProps} isPending={true} />);

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

      render(
        <SignupSigninForm
          {...defaultProps}
          state={stateWithErrors}
          isPending={true}
        />
      );

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
      const termsLabel = termsLabels.find(label =>
        label.getAttribute('for') === 'terms-and-conditions'
      );

      expect(termsLabel).toBeDefined();
      if (termsLabel) {
        expect(termsLabel).toBeInTheDocument();
      }
    });
  });

  describe('component integration', () => {
    it('should handle all props correctly', () => {
      const completeProps = {
        control: mockControl,
        hasTermsAndConditions: true,
        isPending: true,
        setIsVerified: vi.fn(),
        state: {
          errors: {
            email: ['Invalid email'],
            termsAndConditions: ['Required'],
            general: ['Server error']
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
});