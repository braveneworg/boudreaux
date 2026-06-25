/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SignupPage from './page';

const usePathnameMock = vi.hoisted(() => vi.fn());
const useRouterMock = vi.hoisted(() => vi.fn());
const useSearchParamsMock = vi.hoisted(() => vi.fn());
const useSessionMock = vi.hoisted(() => vi.fn());
const signupActionMock = vi.hoisted(() => vi.fn());
const signinActionMock = vi.hoisted(() => vi.fn());

// Validated form values returned by the zodResolver mock on every submission.
const resolvedFormData = vi.hoisted(() => ({
  email: 'fan@example.com',
  password: 'super-secret',
  termsAndConditions: true,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
  useRouter: () => useRouterMock(),
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock('@/app/hooks/use-session', () => ({
  useSession: () => useSessionMock(),
}));

vi.mock('@/lib/actions/signup-action', () => ({
  signupAction: signupActionMock,
}));

vi.mock('@/lib/actions/signin-action', () => ({
  signinAction: signinActionMock,
}));

// Bypass schema validation so handleSubmit always fires with the test data.
vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => () => ({ values: resolvedFormData, errors: {} }),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => createElement('img', props),
}));

vi.mock('@/app/components/ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: ({ items }: { items: Array<{ anchorText: string }> }) => (
    <nav data-testid="breadcrumb">{items[0]?.anchorText}</nav>
  ),
}));

vi.mock('@/app/components/ui/content-container', () => ({
  ContentContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-container">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/page-container', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

// Stub the form: expose buttons to drive Turnstile verification/token and to
// submit the surrounding <form> (which calls form.handleSubmit(handleSubmit)).
let capturedSetIsVerified: ((v: boolean) => void) | null = null;
let capturedOnToken: ((t: string) => void) | null = null;
vi.mock('@/app/components/forms/signup-signin-form', () => ({
  SignupSigninForm: (props: {
    setIsVerified: (v: boolean) => void;
    onTurnstileToken?: (t: string) => void;
  }) => {
    capturedSetIsVerified = props.setIsVerified;
    capturedOnToken = props.onTurnstileToken ?? null;
    return (
      <div data-testid="signup-signin-form">
        <button type="submit">Submit</button>
      </div>
    );
  },
}));

const replaceMock = vi.fn();

const setSearchParams = (value: string | null) => {
  useSearchParamsMock.mockReturnValue({ get: () => value });
};

describe('SignupPage', () => {
  beforeEach(() => {
    usePathnameMock.mockReturnValue('/signin');
    useRouterMock.mockReturnValue({ replace: replaceMock });
    setSearchParams(null);
    useSessionMock.mockReturnValue({ status: 'unauthenticated' });
    replaceMock.mockClear();
    signupActionMock.mockReset();
    signinActionMock.mockReset();
    // Reset the shared form data between tests that mutate it.
    delete (resolvedFormData as Record<string, unknown>).nullField;
  });

  describe('heading by path', () => {
    it('renders the sign-up heading image on the signup path', () => {
      usePathnameMock.mockReturnValue('/signup');
      render(<SignupPage />);

      const headingImage = screen.getByRole('img', { name: /sign up/i });
      expect(headingImage).toHaveAttribute('src', '/media/headings/SIGN-UP.webp');
      expect(screen.getByTestId('breadcrumb')).toHaveTextContent('Sign Up');
    });

    it('renders the sign-in heading image on the signin path', () => {
      usePathnameMock.mockReturnValue('/signin');
      render(<SignupPage />);

      const headingImage = screen.getByRole('img', { name: /sign in/i });
      expect(headingImage).toHaveAttribute('src', '/media/headings/SIGN-IN.webp');
      expect(screen.getByTestId('breadcrumb')).toHaveTextContent('Sign In');
    });
  });

  describe('authenticated redirect', () => {
    it('redirects to an internal callbackUrl when already authenticated', () => {
      useSessionMock.mockReturnValue({ status: 'authenticated' });
      setSearchParams('/collection');

      render(<SignupPage />);

      expect(replaceMock).toHaveBeenCalledWith('/collection');
    });

    it('redirects to the landing page when no callbackUrl is present', () => {
      useSessionMock.mockReturnValue({ status: 'authenticated' });
      setSearchParams(null);

      render(<SignupPage />);

      expect(replaceMock).toHaveBeenCalledWith('/');
    });

    it('ignores an external callbackUrl to avoid an open redirect', () => {
      useSessionMock.mockReturnValue({ status: 'authenticated' });
      setSearchParams('https://evil.example.com');

      render(<SignupPage />);

      expect(replaceMock).toHaveBeenCalledWith('/');
    });

    it('does not redirect when the user is unauthenticated', () => {
      useSessionMock.mockReturnValue({ status: 'unauthenticated' });

      render(<SignupPage />);

      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  describe('form submission', () => {
    it('does not call the action until Turnstile is verified', async () => {
      render(<SignupPage />);

      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => {
        expect(signinActionMock).not.toHaveBeenCalled();
      });
    });

    it('calls signinAction on the signin path once verified, including the turnstile token', async () => {
      signinActionMock.mockResolvedValue({ success: true, errors: {}, fields: {} });
      render(<SignupPage />);

      capturedSetIsVerified?.(true);
      capturedOnToken?.('turnstile-abc');
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => {
        expect(signinActionMock).toHaveBeenCalledTimes(1);
      });
      const formData = signinActionMock.mock.calls[0][1] as FormData;
      expect(formData.get('email')).toBe('fan@example.com');
      expect(formData.get('cf-turnstile-response')).toBe('turnstile-abc');
      expect(signupActionMock).not.toHaveBeenCalled();
    });

    it('calls signupAction on the signup path', async () => {
      usePathnameMock.mockReturnValue('/signup');
      signupActionMock.mockResolvedValue({ success: true, errors: {}, fields: {} });
      render(<SignupPage />);

      capturedSetIsVerified?.(true);
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => {
        expect(signupActionMock).toHaveBeenCalledTimes(1);
      });
    });

    it('omits the turnstile field from FormData when no token is provided', async () => {
      signinActionMock.mockResolvedValue({ success: true, errors: {}, fields: {} });
      render(<SignupPage />);

      capturedSetIsVerified?.(true);
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => {
        expect(signinActionMock).toHaveBeenCalledTimes(1);
      });
      const formData = signinActionMock.mock.calls[0][1] as FormData;
      expect(formData.has('cf-turnstile-response')).toBe(false);
    });

    it('skips null and undefined values when building FormData', async () => {
      (resolvedFormData as Record<string, unknown>).nullField = null;
      signinActionMock.mockResolvedValue({ success: true, errors: {}, fields: {} });
      render(<SignupPage />);

      capturedSetIsVerified?.(true);
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => {
        expect(signinActionMock).toHaveBeenCalledTimes(1);
      });
      const formData = signinActionMock.mock.calls[0][1] as FormData;
      expect(formData.has('nullField')).toBe(false);
    });

    it('surfaces field and general errors when the action reports failure', async () => {
      signinActionMock.mockResolvedValue({
        success: false,
        errors: { email: ['Email already used'], general: ['Try again later'] },
        fields: {},
      });
      render(<SignupPage />);

      capturedSetIsVerified?.(true);
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => {
        expect(signinActionMock).toHaveBeenCalledTimes(1);
      });
      // The form re-renders with isSubmitting reset; the action handled the error path.
      expect(screen.getByTestId('signup-signin-form')).toBeInTheDocument();
    });

    it('handles failure with no specific error fields', async () => {
      signinActionMock.mockResolvedValue({ success: false, fields: {} });
      render(<SignupPage />);

      capturedSetIsVerified?.(true);
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => {
        expect(signinActionMock).toHaveBeenCalledTimes(1);
      });
      expect(screen.getByTestId('signup-signin-form')).toBeInTheDocument();
    });

    it('logs and recovers when the action throws', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      signinActionMock.mockRejectedValue(new Error('network down'));
      render(<SignupPage />);

      capturedSetIsVerified?.(true);
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Form submission error:', expect.any(Error));
      });
      consoleErrorSpy.mockRestore();
    });
  });
});
