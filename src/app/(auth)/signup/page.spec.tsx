/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SignupPage from './page';

type SocialProvider = 'apple' | 'google' | 'facebook' | 'twitter';

const usePathnameMock = vi.hoisted(() => vi.fn());
const useRouterMock = vi.hoisted(() => vi.fn());
const useSearchParamsMock = vi.hoisted(() => vi.fn());
const useSessionMock = vi.hoisted(() => vi.fn());
const signupActionMock = vi.hoisted(() => vi.fn());
const signinActionMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());
const reportClientErrorMock = vi.hoisted(() => vi.fn());

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

vi.mock('sonner', () => ({
  toast: { error: toastErrorMock },
}));

vi.mock('@/lib/utils/report-client-error', () => ({
  reportClientError: reportClientErrorMock,
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

const stashSignupConsentMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/actions/stash-signup-consent-action', () => ({
  stashSignupConsent: stashSignupConsentMock,
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
let capturedOnSocialError: ((provider: SocialProvider, error: unknown) => void) | undefined =
  undefined;
let capturedOnBeforeSocialSignIn: ((provider: SocialProvider) => Promise<boolean>) | undefined =
  undefined;
vi.mock('@/app/components/forms/signup-signin-form', () => ({
  SignupSigninForm: (props: {
    setIsVerified: (v: boolean) => void;
    onTurnstileToken?: (t: string) => void;
    onSocialError?: (provider: SocialProvider, error: unknown) => void;
    onBeforeSocialSignIn?: (provider: SocialProvider) => Promise<boolean>;
    socialDisabled?: boolean;
    heading?: React.ReactNode;
  }) => {
    capturedSetIsVerified = props.setIsVerified;
    capturedOnToken = props.onTurnstileToken ?? null;
    capturedOnSocialError = props.onSocialError;
    capturedOnBeforeSocialSignIn = props.onBeforeSocialSignIn;
    return (
      <div data-testid="signup-signin-form" data-social-disabled={String(!!props.socialDisabled)}>
        {/* The page now renders the heading wordmark inside the card via this prop. */}
        {props.heading}
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
    toastErrorMock.mockClear();
    reportClientErrorMock.mockClear();
    capturedOnSocialError = undefined;
    capturedOnBeforeSocialSignIn = undefined;
    stashSignupConsentMock.mockReset();
    stashSignupConsentMock.mockResolvedValue({ success: true });
    // Reset the shared form data between tests that mutate it.
    delete (resolvedFormData as Record<string, unknown>).nullField;
  });

  describe('social sign-in gating + consent', () => {
    it('gates social sign-in on the signup path until terms + Turnstile pass', () => {
      usePathnameMock.mockReturnValue('/signup');
      render(<SignupPage />);

      // Terms unaccepted + unverified on mount → social buttons disabled.
      expect(screen.getByTestId('signup-signin-form')).toHaveAttribute(
        'data-social-disabled',
        'true'
      );
    });

    it('does not gate social sign-in on the signin path', () => {
      usePathnameMock.mockReturnValue('/signin');
      render(<SignupPage />);

      expect(screen.getByTestId('signup-signin-form')).toHaveAttribute(
        'data-social-disabled',
        'false'
      );
    });

    it('stashes consent (Turnstile + opt-ins) before social sign-in on signup', async () => {
      usePathnameMock.mockReturnValue('/signup');
      render(<SignupPage />);

      // Simulate the Turnstile widget reporting a token (re-renders the page so
      // the consent gate closes over the new token).
      await act(async () => {
        capturedOnToken?.('turnstile-token');
      });

      const proceed = await capturedOnBeforeSocialSignIn?.('google');

      expect(stashSignupConsentMock).toHaveBeenCalledWith({
        turnstileToken: 'turnstile-token',
        allowSmsNotifications: false,
        allowEmailNotifications: false,
      });
      expect(proceed).toBe(true);
    });

    it('aborts social sign-in when stashing consent fails', async () => {
      usePathnameMock.mockReturnValue('/signup');
      stashSignupConsentMock.mockResolvedValue({ success: false, error: 'bad captcha' });
      render(<SignupPage />);

      const proceed = await capturedOnBeforeSocialSignIn?.('google');

      expect(proceed).toBe(false);
      expect(toastErrorMock).toHaveBeenCalledWith('bad captcha');
    });

    it('does not pass a consent gate on the signin path', () => {
      usePathnameMock.mockReturnValue('/signin');
      render(<SignupPage />);

      expect(capturedOnBeforeSocialSignIn).toBeUndefined();
    });
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

  describe('magic-link error rendering', () => {
    it('renders the friendly message when error=new_user_signup_disabled is in the URL', () => {
      useSearchParamsMock.mockReturnValue({
        get: (key: string) => (key === 'error' ? 'new_user_signup_disabled' : null),
      });
      render(<SignupPage />);
      expect(screen.getByText('Signups are temporarily paused.')).toBeInTheDocument();
    });

    it('renders nothing for an unknown error code', () => {
      useSearchParamsMock.mockReturnValue({
        get: (key: string) => (key === 'error' ? 'failed_to_create_user' : null),
      });
      render(<SignupPage />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('renders nothing when no error param is present', () => {
      useSearchParamsMock.mockReturnValue({ get: () => null });
      render(<SignupPage />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('social sign-in error handling', () => {
    it('passes onSocialError to SignupSigninForm', () => {
      render(<SignupPage />);
      expect(capturedOnSocialError).toBeTypeOf('function');
    });

    it('shows a toast with the provider display name when onSocialError is invoked for apple', () => {
      render(<SignupPage />);
      capturedOnSocialError?.('apple', new Error('Auth failed'));
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Couldn't start sign-in with Apple. Please try again."
      );
    });

    it('shows a toast with the provider display name when onSocialError is invoked for google', () => {
      render(<SignupPage />);
      capturedOnSocialError?.('google', new Error('Auth failed'));
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Couldn't start sign-in with Google. Please try again."
      );
    });

    it('shows a toast with the provider display name when onSocialError is invoked for twitter', () => {
      render(<SignupPage />);
      capturedOnSocialError?.('twitter', new Error('Auth failed'));
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Couldn't start sign-in with X (Twitter). Please try again."
      );
    });

    it('calls reportClientError when onSocialError is invoked', () => {
      render(<SignupPage />);
      const err = new Error('Provider config error');
      capturedOnSocialError?.('facebook', err);
      expect(reportClientErrorMock).toHaveBeenCalledWith(err, 'route');
    });

    it('wraps non-Error errors in an Error before reporting', () => {
      render(<SignupPage />);
      capturedOnSocialError?.('apple', 'string error');
      expect(reportClientErrorMock).toHaveBeenCalledWith(expect.any(Error), 'route');
    });
  });
});
