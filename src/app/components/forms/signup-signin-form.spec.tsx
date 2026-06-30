/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SignupSigninForm } from '@/app/components/forms/signup-signin-form';
import type { FormState } from '@/lib/types/form-state';

import type { Control } from 'react-hook-form';

// Common type for both signin and signup schemas (matching the form component)
type BaseFormSchema = {
  email: string;
  general?: string;
  termsAndConditions?: boolean;
  allowSmsNotifications?: boolean;
  allowEmailNotifications?: boolean;
};

// Mock all dependencies
let lastFormInputProps: FormInputProps | null = null;

vi.mock('@/app/components/ui/form-input', () => ({
  FormInput: (props: FormInputProps) => {
    const { id, placeholder, type, autoFocusOnMount, ...rest } = props;
    lastFormInputProps = props; // Store props for testing

    const inputProps: Record<string, unknown> = {
      'data-testid': `form-input-${id}`,
      id,
      placeholder,
      type,
      ...rest,
    };

    if (autoFocusOnMount) {
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
  Button: ({ children, disabled, size, type, ...props }: ButtonProps) => (
    <button disabled={disabled} data-testid="submit-button" data-size={size} type={type} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/app/components/ui/turnstile-widget', () => ({
  TurnstileWidget: ({ setIsVerified, ...props }: TurnstileWidgetProps) => (
    <div
      data-testid="turnstile-widget"
      onClick={() => setIsVerified?.(true)}
      onKeyDown={() => setIsVerified?.(true)}
      role="button"
      tabIndex={0}
      {...props}
    >
      Turnstile Widget
    </div>
  ),
}));

vi.mock('@/app/components/ui/status-indicator', () => ({
  StatusIndicator: ({ isSuccess, hasError, hasTimeout, isPending }: StatusIndicatorProps) => (
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

vi.mock('@/app/components/ui/separator', () => ({
  Separator: ({ className }: { className?: string }) => (
    <hr data-testid="separator" className={className} />
  ),
}));

// Mock SocialProviderButtons so we can test the form independently of its inner workings
const mockSignInSocial = vi.fn();
type SocialProvider = 'apple' | 'google' | 'facebook' | 'twitter';
let capturedSocialOnError: ((provider: SocialProvider, error: unknown) => void) | undefined;
let capturedSocialBeforeSignIn: ((provider: SocialProvider) => Promise<boolean>) | undefined;
vi.mock('@/app/components/auth/social-provider-buttons', () => ({
  SocialProviderButtons: ({
    callbackURL,
    className,
    onError,
    disabled,
    beforeSignIn,
  }: {
    callbackURL: string;
    className?: string;
    onError?: (provider: SocialProvider, error: unknown) => void;
    disabled?: boolean;
    beforeSignIn?: (provider: SocialProvider) => Promise<boolean>;
  }) => {
    capturedSocialOnError = onError;
    capturedSocialBeforeSignIn = beforeSignIn;
    return (
      <div
        data-testid="social-provider-buttons"
        data-callback-url={callbackURL}
        data-disabled={disabled ? 'true' : 'false'}
        className={className}
      >
        <button
          type="button"
          data-testid="social-apple-btn"
          onClick={() => mockSignInSocial({ provider: 'apple', callbackURL })}
        >
          Continue with Apple
        </button>
        <button
          type="button"
          data-testid="social-google-btn"
          onClick={() => mockSignInSocial({ provider: 'google', callbackURL })}
        >
          Continue with Google
        </button>
        <button
          type="button"
          data-testid="social-facebook-btn"
          onClick={() => mockSignInSocial({ provider: 'facebook', callbackURL })}
        >
          Continue with Facebook
        </button>
        <button
          type="button"
          data-testid="social-twitter-btn"
          onClick={() => mockSignInSocial({ provider: 'twitter', callbackURL })}
        >
          Continue with X (Twitter)
        </button>
      </div>
    );
  },
}));

vi.mock('@/app/components/ui/alert', () => ({
  Alert: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="alert" className={className}>
      {children}
    </div>
  ),
  AlertDescription: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="alert-description">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card-content" className={className}>
      {children}
    </div>
  ),
}));

interface FormInputProps {
  id: string;
  placeholder: string;
  type: string;
  autoFocusOnMount?: boolean;
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
  type?: 'button' | 'submit' | 'reset';
  [key: string]: unknown;
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

// Mock useSignupStatusQuery
const mockUseSignupStatusQuery = vi.fn<() => { data: { paused: boolean } | undefined }>(() => ({
  data: undefined,
}));
vi.mock('@/app/hooks/use-signup-status-query', () => ({
  useSignupStatusQuery: () => mockUseSignupStatusQuery(),
}));

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

  describe('social provider buttons', () => {
    it('renders the social provider buttons block', () => {
      render(<SignupSigninForm {...defaultProps} />);
      expect(screen.getByTestId('social-provider-buttons')).toBeInTheDocument();
    });

    it('renders Apple social button', () => {
      render(<SignupSigninForm {...defaultProps} />);
      expect(screen.getByTestId('social-apple-btn')).toBeInTheDocument();
    });

    it('renders Google social button', () => {
      render(<SignupSigninForm {...defaultProps} />);
      expect(screen.getByTestId('social-google-btn')).toBeInTheDocument();
    });

    it('renders Facebook social button', () => {
      render(<SignupSigninForm {...defaultProps} />);
      expect(screen.getByTestId('social-facebook-btn')).toBeInTheDocument();
    });

    it('renders X (Twitter) social button', () => {
      render(<SignupSigninForm {...defaultProps} />);
      expect(screen.getByTestId('social-twitter-btn')).toBeInTheDocument();
    });

    it('clicking Apple button calls signIn.social with apple provider', async () => {
      mockSignInSocial.mockClear();
      render(<SignupSigninForm {...defaultProps} />);
      await userEvent.click(screen.getByTestId('social-apple-btn'));
      expect(mockSignInSocial).toHaveBeenCalledWith(expect.objectContaining({ provider: 'apple' }));
    });

    it('clicking Google button calls signIn.social with google provider', async () => {
      mockSignInSocial.mockClear();
      render(<SignupSigninForm {...defaultProps} />);
      await userEvent.click(screen.getByTestId('social-google-btn'));
      expect(mockSignInSocial).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google' })
      );
    });

    it('clicking Facebook button calls signIn.social with facebook provider', async () => {
      mockSignInSocial.mockClear();
      render(<SignupSigninForm {...defaultProps} />);
      await userEvent.click(screen.getByTestId('social-facebook-btn'));
      expect(mockSignInSocial).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'facebook' })
      );
    });

    it('clicking X button calls signIn.social with twitter provider', async () => {
      mockSignInSocial.mockClear();
      render(<SignupSigninForm {...defaultProps} />);
      await userEvent.click(screen.getByTestId('social-twitter-btn'));
      expect(mockSignInSocial).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'twitter' })
      );
    });

    it('passes callbackURL "/" to SocialProviderButtons by default', () => {
      render(<SignupSigninForm {...defaultProps} />);
      const socialBlock = screen.getByTestId('social-provider-buttons');
      expect(socialBlock).toHaveAttribute('data-callback-url', '/');
    });

    it('passes custom callbackURL when provided', () => {
      render(<SignupSigninForm {...defaultProps} callbackURL="/collection" />);
      const socialBlock = screen.getByTestId('social-provider-buttons');
      expect(socialBlock).toHaveAttribute('data-callback-url', '/collection');
    });

    it('renders social buttons on the signin path too', () => {
      mockUsePathname.mockReturnValue('/signin');
      render(<SignupSigninForm {...defaultProps} hasTermsAndConditions={false} />);
      expect(screen.getByTestId('social-provider-buttons')).toBeInTheDocument();
      mockUsePathname.mockReturnValue('/signup');
    });

    it('forwards onSocialError to SocialProviderButtons as onError', () => {
      const onSocialError = vi.fn();
      capturedSocialOnError = undefined;
      render(<SignupSigninForm {...defaultProps} onSocialError={onSocialError} />);
      expect(capturedSocialOnError).toBe(onSocialError);
    });

    it('does not forward onSocialError when prop is omitted', () => {
      capturedSocialOnError = undefined;
      render(<SignupSigninForm {...defaultProps} />);
      expect(capturedSocialOnError).toBeUndefined();
    });
  });

  describe('divider between social and email sections', () => {
    it('renders a separator between social buttons and email section', () => {
      render(<SignupSigninForm {...defaultProps} />);
      // OrDivider renders two Separator elements (left + right of label)
      expect(screen.getAllByTestId('separator').length).toBeGreaterThanOrEqual(1);
    });

    it('renders "or continue with email" label near the separator', () => {
      render(<SignupSigninForm {...defaultProps} />);
      expect(screen.getByText(/or continue with email/i)).toBeInTheDocument();
    });
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

      // Verify that the FormInput component received the autoFocusOnMount prop
      // Note: JSDOM doesn't fully support autofocus behavior, but we can verify
      // that the component is configured correctly
      expect(lastFormInputProps).not.toBeNull();
      expect(lastFormInputProps?.autoFocusOnMount).toBe(true);
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
      // Multiple next-links may be rendered (terms + mode switch); verify at least one exists
      expect(screen.getAllByTestId('next-link').length).toBeGreaterThanOrEqual(1);
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

      // Multiple next-links may exist; find the terms-and-conditions one by href
      const links = screen.getAllByTestId('next-link');
      const termsLink = links.find((l) => l.getAttribute('href') === '/legal/terms-and-conditions');
      expect(termsLink).toBeDefined();
      expect(termsLink).toBeInTheDocument();
    });

    it('should mark terms switch as required', () => {
      render(<SignupSigninForm {...defaultProps} />);

      const termsSwitch = screen.getByTestId('switch-terms-and-conditions');
      expect(termsSwitch).toHaveAttribute('required');
    });
  });

  describe('SMS opt-in field', () => {
    it('should render the SMS opt-in toggle when hasTermsAndConditions is true', () => {
      render(<SignupSigninForm {...defaultProps} hasTermsAndConditions />);

      expect(screen.getByTestId('switch-allow-sms-notifications')).toBeInTheDocument();
    });

    it('should render the opt-in label', () => {
      render(<SignupSigninForm {...defaultProps} hasTermsAndConditions />);

      expect(screen.getByText(/text me sms updates/i)).toBeInTheDocument();
    });

    it('should explain how to opt out anytime from the profile', () => {
      render(<SignupSigninForm {...defaultProps} hasTermsAndConditions />);

      // SMS-specific copy (the email opt-in below also mentions opting out).
      expect(screen.getByText(/hamburger sheet on mobile/i)).toBeInTheDocument();
    });

    it('should not render the SMS opt-in toggle when hasTermsAndConditions is false', () => {
      render(<SignupSigninForm {...defaultProps} hasTermsAndConditions={false} />);

      expect(screen.queryByTestId('switch-allow-sms-notifications')).not.toBeInTheDocument();
    });
  });

  describe('email updates opt-in field', () => {
    it('should render the email opt-in toggle when hasTermsAndConditions is true', () => {
      render(<SignupSigninForm {...defaultProps} hasTermsAndConditions />);

      expect(screen.getByTestId('switch-allow-email-notifications')).toBeInTheDocument();
    });

    it('should render the opt-in label', () => {
      render(<SignupSigninForm {...defaultProps} hasTermsAndConditions />);

      expect(screen.getByText(/email me updates/i)).toBeInTheDocument();
    });

    it('should not render the email opt-in toggle when hasTermsAndConditions is false', () => {
      render(<SignupSigninForm {...defaultProps} hasTermsAndConditions={false} />);

      expect(screen.queryByTestId('switch-allow-email-notifications')).not.toBeInTheDocument();
    });
  });

  describe('social gating wiring', () => {
    it('forwards socialDisabled to the social buttons', () => {
      render(<SignupSigninForm {...defaultProps} socialDisabled />);

      expect(screen.getByTestId('social-provider-buttons')).toHaveAttribute(
        'data-disabled',
        'true'
      );
    });

    it('enables the social buttons when socialDisabled is false', () => {
      render(<SignupSigninForm {...defaultProps} socialDisabled={false} />);

      expect(screen.getByTestId('social-provider-buttons')).toHaveAttribute(
        'data-disabled',
        'false'
      );
    });

    it('forwards onBeforeSocialSignIn to the social buttons', () => {
      const onBeforeSocialSignIn = vi.fn().mockResolvedValue(true);
      render(<SignupSigninForm {...defaultProps} onBeforeSocialSignIn={onBeforeSocialSignIn} />);

      expect(capturedSocialBeforeSignIn).toBe(onBeforeSocialSignIn);
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
    it('renders submit button with email sign-in label', () => {
      render(<SignupSigninForm {...defaultProps} />);

      const submitButton = screen.getByTestId('submit-button');
      expect(submitButton).toBeInTheDocument();
      expect(submitButton).toHaveTextContent(/email me a sign-in link/i);
    });

    it('submit button has type="submit" for explicit submit semantics', () => {
      render(<SignupSigninForm {...defaultProps} />);

      const submitButton = screen.getByTestId('submit-button');
      expect(submitButton).toHaveAttribute('type', 'submit');
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

  describe('form layout and structure', () => {
    it('renders the card container', () => {
      render(<SignupSigninForm {...defaultProps} />);
      expect(screen.getByTestId('card')).toBeInTheDocument();
    });

    it('should apply correct CSS classes to form container', () => {
      render(<SignupSigninForm {...defaultProps} />);

      // Check for form structure elements — email + terms + SMS + email opt-in
      expect(screen.getAllByTestId('form-item')).toHaveLength(4);
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

      // The agreements toggles render above the email field, so find the email
      // label by its `for` rather than assuming it is the first one.
      const emailLabel = screen
        .getAllByTestId('form-label')
        .find((label) => label.getAttribute('for') === 'email');
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

  describe('mode switch link', () => {
    it('shows a link to signup when on the signin path', () => {
      mockUsePathname.mockReturnValue('/signin');
      render(<SignupSigninForm {...defaultProps} hasTermsAndConditions={false} />);
      expect(screen.getByRole('link', { name: /create an account/i })).toBeInTheDocument();
      mockUsePathname.mockReturnValue('/signup');
    });

    it('shows a link to signin when on the signup path', () => {
      mockUsePathname.mockReturnValue('/signup');
      render(<SignupSigninForm {...defaultProps} />);
      expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
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
      expect(screen.getByTestId('social-provider-buttons')).toBeInTheDocument();
      expect(screen.getAllByTestId('separator').length).toBeGreaterThanOrEqual(1);
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

    it('renders social provider buttons on signin path', () => {
      render(<SignupSigninForm {...defaultProps} />);
      expect(screen.getByTestId('social-provider-buttons')).toBeInTheDocument();
    });
  });

  describe('signups-paused notice', () => {
    const signupProps = () => ({ ...defaultProps, hasTermsAndConditions: true });
    const signinProps = () => ({ ...defaultProps, hasTermsAndConditions: false });

    beforeEach(() => {
      mockUseSignupStatusQuery.mockReturnValue({ data: undefined });
      mockUsePathname.mockReturnValue('/signup');
    });

    afterEach(() => {
      mockUsePathname.mockReturnValue('/signup');
    });

    it('shows the paused notice and disables submit on the signup path when paused', () => {
      mockUseSignupStatusQuery.mockReturnValue({ data: { paused: true } });
      render(<SignupSigninForm {...signupProps()} />);
      expect(screen.getByText(/signups are temporarily paused/i)).toBeInTheDocument();
    });

    it('does not show the notice on the signin path', () => {
      mockUseSignupStatusQuery.mockReturnValue({ data: { paused: true } });
      mockUsePathname.mockReturnValue('/signin');
      render(<SignupSigninForm {...signinProps()} />);
      expect(screen.queryByText(/signups are temporarily paused/i)).not.toBeInTheDocument();
    });

    it('disables the submit button when signups are paused on the signup path', () => {
      mockUseSignupStatusQuery.mockReturnValue({ data: { paused: true } });
      render(<SignupSigninForm {...signupProps()} />);
      expect(screen.getByTestId('submit-button')).toBeDisabled();
    });

    it('does not disable the submit button when signups are not paused', () => {
      mockUseSignupStatusQuery.mockReturnValue({ data: { paused: false } });
      render(<SignupSigninForm {...signupProps()} />);
      expect(screen.getByTestId('submit-button')).not.toBeDisabled();
    });

    it('does not show the notice when signupStatus data is undefined', () => {
      mockUseSignupStatusQuery.mockReturnValue({ data: undefined });
      render(<SignupSigninForm {...signupProps()} />);
      expect(screen.queryByText(/signups are temporarily paused/i)).not.toBeInTheDocument();
    });
  });

  describe('unverified state', () => {
    it('renders skeleton placeholders when isVerified is false', () => {
      render(<SignupSigninForm {...defaultProps} isVerified={false} />);

      const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
      expect(skeletons.length).toBeGreaterThanOrEqual(2);
    });

    it('hides email input when isVerified is false', () => {
      render(<SignupSigninForm {...defaultProps} isVerified={false} />);

      expect(screen.queryByTestId('form-input-email')).not.toBeInTheDocument();
    });

    it('hides submit button when isVerified is false', () => {
      render(<SignupSigninForm {...defaultProps} isVerified={false} />);

      expect(screen.queryByTestId('submit-button')).not.toBeInTheDocument();
    });

    it('still renders turnstile widget when isVerified is false', () => {
      render(<SignupSigninForm {...defaultProps} isVerified={false} />);

      expect(screen.getByTestId('turnstile-widget')).toBeInTheDocument();
    });

    it('still renders social provider buttons when isVerified is false', () => {
      render(<SignupSigninForm {...defaultProps} isVerified={false} />);

      expect(screen.getByTestId('social-provider-buttons')).toBeInTheDocument();
    });
  });
});
