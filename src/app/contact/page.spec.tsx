/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted mocks
const mockUseSession = vi.hoisted(() => vi.fn());
const mockContactAction = vi.hoisted(() => vi.fn());
const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

// Resolved data returned by the zodResolver mock on every submission
const resolvedFormData = vi.hoisted(() => ({
  reason: 'question',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '+1 555-123-4567',
  message: 'I have a question about your releases.',
}));

vi.mock('next-auth/react', () => ({
  useSession: mockUseSession,
}));

vi.mock('@/lib/actions/contact-action', () => ({
  contactAction: mockContactAction,
}));

vi.mock('sonner', () => ({
  toast: mockToast,
}));

// Bypass form validation so handleSubmit always fires with test data
vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => () => ({
    values: resolvedFormData,
    errors: {},
  }),
}));

// Mock framer-motion
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

// Capture TurnstileWidget callbacks to simulate verification
let capturedSetIsVerified: ((v: boolean) => void) | null = null;
let capturedOnToken: ((t: string) => void) | null = null;
vi.mock('@/app/components/ui/turnstile-widget', () => ({
  default: (props: { setIsVerified: (v: boolean) => void; onToken: (t: string) => void }) => {
    capturedSetIsVerified = props.setIsVerified;
    capturedOnToken = props.onToken;
    return <div data-testid="turnstile-widget" />;
  },
}));

// Mock ComboboxField
vi.mock('@/app/components/forms/fields/combobox-field', () => ({
  default: (props: { name: string; setValue: (name: string, value: string) => void }) => (
    <select
      data-testid="reason-combobox"
      onChange={(e) => props.setValue(props.name, e.target.value)}
    >
      <option value="">Select a reason...</option>
      <option value="question">Question</option>
    </select>
  ),
}));

// Mock TextField
vi.mock('@/app/components/forms/fields/text-field', () => ({
  default: (props: { name: string; label: string; placeholder: string }) => (
    <div>
      <label htmlFor={props.name}>{props.label}</label>
      <input
        id={props.name}
        name={props.name}
        placeholder={props.placeholder}
        data-testid={`field-${props.name}`}
      />
    </div>
  ),
}));

vi.mock('@/app/components/ui/status-indicator', () => ({
  default: () => <div data-testid="status-indicator" />,
}));

describe('ContactPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: vi.fn(),
    });
    capturedSetIsVerified = null;
    capturedOnToken = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function importAndRender() {
    const { default: ContactPage } = await import('@/app/contact/page');
    const user = userEvent.setup();
    const result = render(<ContactPage />);
    return { ...result, user };
  }

  /** Simulate Turnstile verification before submission */
  function simulateTurnstile(token = 'test-turnstile-token') {
    act(() => {
      capturedSetIsVerified?.(true);
      capturedOnToken?.(token);
    });
  }

  describe('rendering', () => {
    it('should render the page heading', async () => {
      await importAndRender();
      expect(screen.getByRole('heading', { name: /contact us/i })).toBeInTheDocument();
    });

    it('should render the breadcrumb', async () => {
      await importAndRender();
      expect(screen.getByText('Contact')).toBeInTheDocument();
    });

    it('should render the intro paragraph', async () => {
      await importAndRender();
      expect(screen.getByText(/have a question, demo, or business inquiry/i)).toBeInTheDocument();
    });

    it('should render form fields', async () => {
      await importAndRender();
      expect(screen.getByTestId('reason-combobox')).toBeInTheDocument();
      expect(screen.getByTestId('field-firstName')).toBeInTheDocument();
      expect(screen.getByTestId('field-lastName')).toBeInTheDocument();
      expect(screen.getByTestId('field-email')).toBeInTheDocument();
      expect(screen.getByTestId('field-phone')).toBeInTheDocument();
    });

    it('should render TurnstileWidget', async () => {
      await importAndRender();
      expect(screen.getByTestId('turnstile-widget')).toBeInTheDocument();
    });

    it('should render submit button', async () => {
      await importAndRender();
      expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
    });

    it('should render co-founders info', async () => {
      await importAndRender();
      expect(screen.getByText(/co-founders\/owners/i)).toBeInTheDocument();
      expect(screen.getByText(/ceschi ramos and david ramos/i)).toBeInTheDocument();
    });

    it('should render label manager info', async () => {
      await importAndRender();
      expect(screen.getByText(/label manager/i)).toBeInTheDocument();
      expect(screen.getByText('dylanowenmusic@gmail.com')).toBeInTheDocument();
    });

    it('should render distribution info', async () => {
      await importAndRender();
      expect(screen.getByText(/distribution/i)).toBeInTheDocument();
      expect(screen.getByText(/jeep ward at redeye worldwide/i)).toBeInTheDocument();
      expect(screen.getByText('jeephalo@gmail.com')).toBeInTheDocument();
    });

    it('should render media and fan support info', async () => {
      await importAndRender();
      expect(screen.getByText(/media and fan support/i)).toBeInTheDocument();
      expect(screen.getByText('nikianarchy@gmail.com')).toBeInTheDocument();
    });

    it('should render customer service info', async () => {
      await importAndRender();
      expect(screen.getByText(/customer service/i)).toBeInTheDocument();
      expect(screen.getByText('djmoniklz@gmail.com')).toBeInTheDocument();
    });
  });

  describe('session auto-population', () => {
    it('should have fields enabled when user is not logged in', async () => {
      await importAndRender();

      expect(screen.getByTestId('field-firstName')).not.toBeDisabled();
      expect(screen.getByTestId('field-lastName')).not.toBeDisabled();
      expect(screen.getByTestId('field-email')).not.toBeDisabled();
    });

    it('should have fields enabled when user is logged in', async () => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            id: 'user-1',
            firstName: 'John',
            lastName: 'Smith',
            email: 'john@example.com',
            phone: '+1 555-000-1234',
          },
          expires: new Date(Date.now() + 86400000).toISOString(),
        },
        status: 'authenticated',
        update: vi.fn(),
      });

      await importAndRender();

      expect(screen.getByTestId('field-firstName')).not.toBeDisabled();
      expect(screen.getByTestId('field-lastName')).not.toBeDisabled();
      expect(screen.getByTestId('field-email')).not.toBeDisabled();
    });
  });

  describe('form submission — unverified', () => {
    it('should not call contactAction when Turnstile is not verified', async () => {
      const { user } = await importAndRender();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(mockContactAction).not.toHaveBeenCalled();
      });
    });
  });

  describe('form submission — success', () => {
    it('should call contactAction and show success toast', async () => {
      mockContactAction.mockResolvedValue({
        success: true,
        errors: {},
        fields: {},
      });

      const { user } = await importAndRender();
      simulateTurnstile();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(mockContactAction).toHaveBeenCalledTimes(1);
      });

      expect(mockToast.success).toHaveBeenCalledWith(
        "Your message has been sent. We'll get back to you soon."
      );
    });

    it('should include turnstile token in FormData', async () => {
      mockContactAction.mockResolvedValue({
        success: true,
        errors: {},
        fields: {},
      });

      const { user } = await importAndRender();
      simulateTurnstile('my-token-123');

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(mockContactAction).toHaveBeenCalledTimes(1);
      });

      const formDataArg = mockContactAction.mock.calls[0][1] as FormData;
      expect(formDataArg.get('cf-turnstile-response')).toBe('my-token-123');
    });

    it('should include resolved form data entries in FormData', async () => {
      mockContactAction.mockResolvedValue({
        success: true,
        errors: {},
        fields: {},
      });

      const { user } = await importAndRender();
      simulateTurnstile();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(mockContactAction).toHaveBeenCalledTimes(1);
      });

      const formDataArg = mockContactAction.mock.calls[0][1] as FormData;
      expect(formDataArg.get('reason')).toBe('question');
      expect(formDataArg.get('firstName')).toBe('Jane');
      expect(formDataArg.get('lastName')).toBe('Doe');
      expect(formDataArg.get('email')).toBe('jane@example.com');
      expect(formDataArg.get('phone')).toBe('+1 555-123-4567');
      expect(formDataArg.get('message')).toBe('I have a question about your releases.');
    });

    it('should not append turnstile token to FormData when token is empty', async () => {
      mockContactAction.mockResolvedValue({
        success: true,
        errors: {},
        fields: {},
      });

      const { user } = await importAndRender();

      // Set verified to true but don't provide a token
      act(() => {
        capturedSetIsVerified?.(true);
      });

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(mockContactAction).toHaveBeenCalledTimes(1);
      });

      const formDataArg = mockContactAction.mock.calls[0][1] as FormData;
      expect(formDataArg.has('cf-turnstile-response')).toBe(false);
    });

    it('should skip null and undefined values when building FormData', async () => {
      // Temporarily add null/undefined values to resolvedFormData
      const extra = resolvedFormData as Record<string, unknown>;
      extra.nullField = null;
      extra.undefinedField = undefined;

      mockContactAction.mockResolvedValue({
        success: true,
        errors: {},
        fields: {},
      });

      const { user } = await importAndRender();
      simulateTurnstile();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(mockContactAction).toHaveBeenCalledTimes(1);
      });

      const formDataArg = mockContactAction.mock.calls[0][1] as FormData;
      expect(formDataArg.has('nullField')).toBe(false);
      expect(formDataArg.has('undefinedField')).toBe(false);

      // Clean up
      delete extra.nullField;
      delete extra.undefinedField;
    });
  });

  describe('form submission — failure', () => {
    it('should show error toast when general error is returned', async () => {
      mockContactAction.mockResolvedValue({
        success: false,
        errors: { general: ['Server error occurred'] },
        fields: {},
      });

      const { user } = await importAndRender();
      simulateTurnstile();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Server error occurred');
      });
    });

    it('should handle failure with all field-specific errors', async () => {
      mockContactAction.mockResolvedValue({
        success: false,
        errors: {
          reason: ['Please select a reason'],
          firstName: ['First name is required'],
          lastName: ['Last name is required'],
          email: ['Invalid email'],
          phone: ['Invalid phone'],
          message: ['Message too short'],
        },
        fields: {},
      });

      const { user } = await importAndRender();
      simulateTurnstile();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(mockContactAction).toHaveBeenCalledTimes(1);
      });

      // No general error — toast.error should not be called
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it('should handle failure with both general and field errors', async () => {
      mockContactAction.mockResolvedValue({
        success: false,
        errors: {
          general: ['Something went wrong'],
          email: ['Invalid email address'],
        },
        fields: {},
      });

      const { user } = await importAndRender();
      simulateTurnstile();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Something went wrong');
      });
    });

    it('should use fallback message when general error array has empty first element', async () => {
      mockContactAction.mockResolvedValue({
        success: false,
        errors: { general: [''] },
        fields: {},
      });

      const { user } = await importAndRender();
      simulateTurnstile();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Something went wrong. Please try again.');
      });
    });

    it('should handle failure with empty errors object', async () => {
      mockContactAction.mockResolvedValue({
        success: false,
        errors: {},
        fields: {},
      });

      const { user } = await importAndRender();
      simulateTurnstile();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(mockContactAction).toHaveBeenCalledTimes(1);
      });

      expect(mockToast.error).not.toHaveBeenCalled();
      expect(mockToast.success).not.toHaveBeenCalled();
    });
  });

  describe('form submission — exception', () => {
    it('should handle thrown errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockContactAction.mockRejectedValue(new Error('Network failure'));

      const { user } = await importAndRender();
      simulateTurnstile();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'Contact form submission error:',
          expect.any(Error)
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });
});
