/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SocialProviderButtons } from './social-provider-buttons';

// Mock the auth client at the boundary
const mockSignInSocial = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: {
      social: (...args: unknown[]) => mockSignInSocial(...args),
    },
  },
}));

// Mock the client error reporter
const mockReportClientError = vi.fn();
vi.mock('@/lib/utils/report-client-error', () => ({
  reportClientError: (...args: unknown[]) => mockReportClientError(...args),
}));

// Mock brand icons so SVG rendering doesn't interfere with queries
vi.mock('@/app/components/ui/brand-icons', () => ({
  AppleIcon: () => <svg data-testid="apple-icon" aria-hidden="true" />,
  GoogleIcon: () => <svg data-testid="google-icon" aria-hidden="true" />,
  FacebookIcon: () => <svg data-testid="facebook-icon" aria-hidden="true" />,
  XIcon: () => <svg data-testid="x-icon" aria-hidden="true" />,
}));

vi.mock('@/app/components/ui/button', () => ({
  Button: ({
    children,
    disabled,
    onClick,
    className,
    ...props
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    className?: string;
  }) => (
    <button
      disabled={disabled}
      onClick={onClick}
      className={className}
      data-slot="button"
      {...props}
    >
      {children}
    </button>
  ),
}));

describe('SocialProviderButtons', () => {
  beforeEach(() => {
    mockSignInSocial.mockClear();
    mockReportClientError.mockClear();
    mockSignInSocial.mockResolvedValue({ data: null, error: null });
  });

  describe('rendering', () => {
    it('renders four provider buttons', () => {
      render(<SocialProviderButtons callbackURL="/" />);

      expect(screen.getByRole('button', { name: /apple/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /facebook/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /x \(twitter\)/i })).toBeInTheDocument();
    });

    it('renders Apple button with accessible name', () => {
      render(<SocialProviderButtons callbackURL="/" />);
      const btn = screen.getByRole('button', { name: /continue with apple/i });
      expect(btn).toBeInTheDocument();
    });

    it('renders Google button with accessible name', () => {
      render(<SocialProviderButtons callbackURL="/" />);
      const btn = screen.getByRole('button', { name: /continue with google/i });
      expect(btn).toBeInTheDocument();
    });

    it('renders Facebook button with accessible name', () => {
      render(<SocialProviderButtons callbackURL="/" />);
      const btn = screen.getByRole('button', { name: /continue with facebook/i });
      expect(btn).toBeInTheDocument();
    });

    it('renders X (Twitter) button with accessible name', () => {
      render(<SocialProviderButtons callbackURL="/" />);
      const btn = screen.getByRole('button', { name: /continue with x \(twitter\)/i });
      expect(btn).toBeInTheDocument();
    });

    it('renders brand icons with aria-hidden', () => {
      render(<SocialProviderButtons callbackURL="/" />);
      expect(screen.getByTestId('apple-icon')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getByTestId('google-icon')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getByTestId('facebook-icon')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getByTestId('x-icon')).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('interactions', () => {
    it('calls authClient.signIn.social with apple provider on Apple button click', async () => {
      render(<SocialProviderButtons callbackURL="/collection" />);

      await userEvent.click(screen.getByRole('button', { name: /continue with apple/i }));

      expect(mockSignInSocial).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'apple', callbackURL: '/collection' })
      );
    });

    it('calls authClient.signIn.social with google provider on Google button click', async () => {
      render(<SocialProviderButtons callbackURL="/collection" />);

      await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));

      expect(mockSignInSocial).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google', callbackURL: '/collection' })
      );
    });

    it('calls authClient.signIn.social with facebook provider on Facebook button click', async () => {
      render(<SocialProviderButtons callbackURL="/" />);

      await userEvent.click(screen.getByRole('button', { name: /continue with facebook/i }));

      expect(mockSignInSocial).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'facebook', callbackURL: '/' })
      );
    });

    it('calls authClient.signIn.social with twitter provider on X button click', async () => {
      render(<SocialProviderButtons callbackURL="/" />);

      await userEvent.click(screen.getByRole('button', { name: /continue with x \(twitter\)/i }));

      expect(mockSignInSocial).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'twitter', callbackURL: '/' })
      );
    });

    it('disables all buttons while a sign-in is pending', async () => {
      // Make the promise hang so we can check disabled state mid-flight
      let resolveSignIn!: () => void;
      mockSignInSocial.mockReturnValue(
        new Promise<void>((res) => {
          resolveSignIn = res;
        })
      );

      render(<SocialProviderButtons callbackURL="/" />);

      const appleBtn = screen.getByRole('button', { name: /continue with apple/i });
      await userEvent.click(appleBtn);

      // While pending, all four buttons should be disabled
      const buttons = screen.getAllByRole('button');
      for (const btn of buttons) {
        expect(btn).toBeDisabled();
      }

      resolveSignIn();
    });

    it('re-enables buttons after sign-in resolves', async () => {
      mockSignInSocial.mockResolvedValue({ data: null, error: null });

      render(<SocialProviderButtons callbackURL="/" />);

      await userEvent.click(screen.getByRole('button', { name: /continue with apple/i }));

      // After resolution all buttons should be enabled again
      const buttons = screen.getAllByRole('button');
      for (const btn of buttons) {
        expect(btn).not.toBeDisabled();
      }
    });
  });

  describe('optional props', () => {
    it('renders without crashing when callbackURL is an internal path', () => {
      expect(() => render(<SocialProviderButtons callbackURL="/releases" />)).not.toThrow();
    });

    it('accepts a className prop for layout customisation', () => {
      const { container } = render(<SocialProviderButtons callbackURL="/" className="mt-4" />);
      expect(container.firstChild).toHaveClass('mt-4');
    });
  });

  describe('error handling', () => {
    it('calls onError with provider and error when signIn.social rejects, and resets loading', async () => {
      const networkError = new Error('Network unavailable');
      mockSignInSocial.mockRejectedValue(networkError);
      const onError = vi.fn();

      render(<SocialProviderButtons callbackURL="/" onError={onError} />);

      await userEvent.click(screen.getByRole('button', { name: /continue with apple/i }));

      expect(onError).toHaveBeenCalledWith('apple', networkError);
      // Loading should be reset after the error
      const buttons = screen.getAllByRole('button');
      for (const btn of buttons) {
        expect(btn).not.toBeDisabled();
      }
    });

    it('calls onError with provider and error when signIn.social resolves with a non-null error', async () => {
      const authError = new Error('Provider configuration error');
      mockSignInSocial.mockResolvedValue({ data: null, error: authError });
      const onError = vi.fn();

      render(<SocialProviderButtons callbackURL="/" onError={onError} />);

      await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));

      expect(onError).toHaveBeenCalledWith('google', authError);
    });

    it('falls back to reportClientError when onError is not provided and signIn rejects', async () => {
      const networkError = new Error('Connection refused');
      mockSignInSocial.mockRejectedValue(networkError);

      render(<SocialProviderButtons callbackURL="/" />);

      await userEvent.click(screen.getByRole('button', { name: /continue with apple/i }));

      expect(mockReportClientError).toHaveBeenCalledWith(networkError, 'route');
    });

    it('falls back to reportClientError when onError is not provided and signIn resolves with error', async () => {
      const authError = new Error('Provider disabled');
      mockSignInSocial.mockResolvedValue({ data: null, error: authError });

      render(<SocialProviderButtons callbackURL="/" />);

      await userEvent.click(screen.getByRole('button', { name: /continue with facebook/i }));

      expect(mockReportClientError).toHaveBeenCalledWith(authError, 'route');
    });

    it('does not call onError or reportClientError on a successful sign-in', async () => {
      mockSignInSocial.mockResolvedValue({ data: { session: {} }, error: null });
      const onError = vi.fn();

      render(<SocialProviderButtons callbackURL="/" onError={onError} />);

      await userEvent.click(screen.getByRole('button', { name: /continue with apple/i }));

      expect(onError).not.toHaveBeenCalled();
      expect(mockReportClientError).not.toHaveBeenCalled();
    });
  });
});
