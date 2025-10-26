import React from 'react';

import { render, screen } from '@testing-library/react';

import AuthToolbar from './auth-toolbar';

// Mock next-auth
const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

// Mock child components
vi.mock('./signin-link', () => ({
  default: () => <div data-testid="signin-link">Sign In Link</div>,
}));

vi.mock('./signup-link', () => ({
  default: () => <div data-testid="signup-link">Sign Up Link</div>,
}));

vi.mock('./signout-button', () => ({
  default: ({ className }: { className?: string }) => (
    <div data-testid="signout-toolbar" className={className}>
      Signed In Toolbar
    </div>
  ),
}));

vi.mock('../ui/vertical-separator', () => ({
  default: () => <div data-testid="vertical-separator">|</div>,
}));

vi.mock('@/app/lib/utils/auth/tailwind-utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

describe('AuthToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when user is unauthenticated', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        status: 'unauthenticated',
        data: null,
      });
    });

    it('renders sign in and sign up links', () => {
      render(<AuthToolbar />);

      expect(screen.getByTestId('signin-link')).toBeInTheDocument();
      expect(screen.getByTestId('signup-link')).toBeInTheDocument();
      expect(screen.getByTestId('vertical-separator')).toBeInTheDocument();
    });

    it('does not render signed in toolbar', () => {
      render(<AuthToolbar />);

      expect(screen.queryByTestId('signout-toolbar')).not.toBeInTheDocument();
    });

    it('applies custom className when provided', () => {
      const { container } = render(<AuthToolbar className="custom-class" />);

      const toolbar = container.querySelector('.custom-class');
      expect(toolbar).toBeInTheDocument();
    });
  });

  describe('when user is authenticated', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        status: 'authenticated',
        data: {
          user: {
            id: '1',
            email: 'test@example.com',
            username: 'testuser',
          },
        },
      });
    });

    it('renders signed in toolbar', () => {
      render(<AuthToolbar />);

      expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
    });

    it('does not render sign in and sign up links', () => {
      render(<AuthToolbar />);

      expect(screen.queryByTestId('signin-link')).not.toBeInTheDocument();
      expect(screen.queryByTestId('signup-link')).not.toBeInTheDocument();
    });

    it('passes className to signed in toolbar', () => {
      render(<AuthToolbar className="custom-class" />);

      const toolbar = screen.getByTestId('signout-toolbar');
      expect(toolbar).toHaveClass('custom-class');
    });
  });

  describe('when session status is loading', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        status: 'loading',
        data: null,
      });
    });

    it('renders loading state', () => {
      render(<AuthToolbar />);

      expect(screen.getByText('Loading')).toBeInTheDocument();
    });

    it('does not render sign in/up links or signed in toolbar while loading', () => {
      render(<AuthToolbar />);

      expect(screen.queryByTestId('signin-link')).not.toBeInTheDocument();
      expect(screen.queryByTestId('signup-link')).not.toBeInTheDocument();
      expect(screen.queryByTestId('signout-toolbar')).not.toBeInTheDocument();
    });
  });
});
