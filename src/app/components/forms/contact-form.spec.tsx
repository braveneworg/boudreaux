/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, FormProvider } from 'react-hook-form';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ContactForm from '@/app/components/forms/contact-form';
import type { FormState } from '@/lib/types/form-state';
import type { ContactFormSchemaType } from '@/lib/validation/contact-schema';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(function MockMotionDiv(
      props: React.HTMLAttributes<HTMLDivElement>,
      ref: React.Ref<HTMLDivElement>
    ) {
      return <div ref={ref} {...props} />;
    }),
  },
}));

// Mock TurnstileWidget
const mockTurnstileWidget = vi.fn();
vi.mock('@/app/components/ui/turnstile-widget', () => ({
  default: (props: Record<string, unknown>) => {
    mockTurnstileWidget(props);
    return <div data-testid="turnstile-widget" />;
  },
}));

// Mock StatusIndicator
const mockStatusIndicator = vi.fn();
vi.mock('@/app/components/ui/status-indicator', () => ({
  default: (props: Record<string, unknown>) => {
    mockStatusIndicator(props);
    return <div data-testid="status-indicator" />;
  },
}));

// Mock ComboboxField
const mockComboboxField = vi.fn();
vi.mock('@/app/components/forms/fields/combobox-field', () => ({
  default: (props: Record<string, unknown>) => {
    mockComboboxField(props);
    return <div data-testid="combobox-field">{String(props.label)}</div>;
  },
}));

// Mock TextField
const mockTextField = vi.fn();
vi.mock('@/app/components/forms/fields/text-field', () => ({
  default: (props: Record<string, unknown>) => {
    mockTextField(props);
    return (
      <div data-testid={`text-field-${String(props.name)}`}>
        <label>{String(props.label)}</label>
        <input
          name={String(props.name)}
          placeholder={String(props.placeholder)}
          disabled={!!props.disabled}
        />
      </div>
    );
  },
}));

const defaultState: FormState = {
  errors: {},
  fields: {},
  success: false,
};

function renderContactForm(overrides?: Partial<React.ComponentProps<typeof ContactForm>>) {
  const defaultProps: React.ComponentProps<typeof ContactForm> = {
    control: undefined as never, // Will be overridden by Wrapper
    isPending: false,
    isVerified: true,
    setIsVerified: vi.fn(),
    onTurnstileToken: vi.fn(),
    state: defaultState,
    setValue: vi.fn(),
    ...overrides,
  };

  // We need a form context wrapper with the real control
  function TestHarness() {
    const methods = useForm<ContactFormSchemaType>({
      defaultValues: {
        reason: '',
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        message: '',
      },
    });
    return (
      <FormProvider {...methods}>
        <ContactForm {...defaultProps} control={methods.control} setValue={methods.setValue} />
      </FormProvider>
    );
  }

  const user = userEvent.setup();
  const result = render(<TestHarness />);
  return { ...result, user };
}

describe('ContactForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the reason combobox', () => {
      renderContactForm();
      expect(screen.getByTestId('combobox-field')).toBeInTheDocument();
      expect(mockComboboxField).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'reason',
          label: 'Reason',
        })
      );
    });

    it('should render first name and last name text fields', () => {
      renderContactForm();
      expect(screen.getByTestId('text-field-firstName')).toBeInTheDocument();
      expect(screen.getByTestId('text-field-lastName')).toBeInTheDocument();
    });

    it('should render email text field', () => {
      renderContactForm();
      expect(screen.getByTestId('text-field-email')).toBeInTheDocument();
      expect(mockTextField).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'email',
          type: 'email',
        })
      );
    });

    it('should render phone text field', () => {
      renderContactForm();
      expect(screen.getByTestId('text-field-phone')).toBeInTheDocument();
      expect(mockTextField).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'phone',
          type: 'tel',
        })
      );
    });

    it('should render message textarea', () => {
      renderContactForm();
      expect(screen.getByPlaceholderText('How can we help?')).toBeInTheDocument();
    });

    it('should render submit button', () => {
      renderContactForm();
      expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
    });

    it('should render TurnstileWidget', () => {
      renderContactForm();
      expect(screen.getByTestId('turnstile-widget')).toBeInTheDocument();
    });

    it('should render StatusIndicator', () => {
      renderContactForm();
      expect(screen.getByTestId('status-indicator')).toBeInTheDocument();
    });
  });

  describe('field configuration', () => {
    it('should not disable name and email fields', () => {
      renderContactForm();

      const firstNameCalls = mockTextField.mock.calls.filter(
        (call) => call[0].name === 'firstName'
      );
      const lastNameCalls = mockTextField.mock.calls.filter((call) => call[0].name === 'lastName');
      const emailCalls = mockTextField.mock.calls.filter((call) => call[0].name === 'email');

      expect(firstNameCalls[0][0].disabled).toBeUndefined();
      expect(lastNameCalls[0][0].disabled).toBeUndefined();
      expect(emailCalls[0][0].disabled).toBeUndefined();
    });

    it('should not disable phone field', () => {
      renderContactForm();

      const phoneCalls = mockTextField.mock.calls.filter((call) => call[0].name === 'phone');

      expect(phoneCalls[0][0].disabled).toBeUndefined();
    });
  });

  describe('pending state', () => {
    it('should disable submit button when isPending is true', () => {
      renderContactForm({ isPending: true });
      expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled();
    });

    it('should enable submit button when isPending is false', () => {
      renderContactForm({ isPending: false });
      expect(screen.getByRole('button', { name: /send message/i })).not.toBeDisabled();
    });

    it('should pass isPending to StatusIndicator', () => {
      renderContactForm({ isPending: true });
      expect(mockStatusIndicator).toHaveBeenCalledWith(
        expect.objectContaining({ isPending: true })
      );
    });
  });

  describe('state feedback', () => {
    it('should pass success state to StatusIndicator', () => {
      renderContactForm({
        state: { ...defaultState, success: true },
      });
      expect(mockStatusIndicator).toHaveBeenCalledWith(
        expect.objectContaining({ isSuccess: true })
      );
    });

    it('should pass error state to StatusIndicator', () => {
      renderContactForm({
        state: { ...defaultState, errors: { email: ['Invalid'] } },
      });
      expect(mockStatusIndicator).toHaveBeenCalledWith(expect.objectContaining({ hasError: true }));
    });

    it('should display general error message', () => {
      renderContactForm({
        state: {
          ...defaultState,
          errors: { general: ['Something went wrong'] },
        },
      });
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should not display general error section when no general errors exist', () => {
      renderContactForm({
        state: { ...defaultState, errors: {} },
      });
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });
  });

  describe('TurnstileWidget props', () => {
    it('should pass isVerified and setIsVerified to TurnstileWidget', () => {
      const setIsVerified = vi.fn();
      const onTurnstileToken = vi.fn();

      renderContactForm({
        isVerified: true,
        setIsVerified,
        onTurnstileToken,
      });

      expect(mockTurnstileWidget).toHaveBeenCalledWith(
        expect.objectContaining({
          isVerified: true,
          setIsVerified,
          onToken: onTurnstileToken,
        })
      );
    });
  });

  describe('message textarea', () => {
    it('should render with correct attributes', () => {
      renderContactForm();
      const textarea = screen.getByPlaceholderText('How can we help?');
      expect(textarea).toBeInTheDocument();
      expect(textarea.tagName).toBe('TEXTAREA');
    });
  });
});
