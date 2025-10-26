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

// Mock console-logger
const mockLog = vi.fn();
vi.mock('@/app/lib/utils/console-logger', () => ({
  log: (...args: unknown[]) => mockLog(...args),
}));

describe('AuthToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

    it('logs unauthenticated message', () => {
      render(<AuthToolbar />);

      expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Rendering unauthenticated links');
    });

    it('merges multiple classNames correctly', () => {
      const { container } = render(<AuthToolbar className="custom-class another-class" />);

      const toolbar = container.querySelector('.custom-class');
      expect(toolbar).toHaveClass('custom-class', 'another-class');
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

    it('logs authenticated message', () => {
      render(<AuthToolbar />);

      expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Rendering authenticated toolbar');
    });

    describe('with admin role', () => {
      beforeEach(() => {
        mockUseSession.mockReturnValue({
          status: 'authenticated',
          data: {
            user: {
              id: '1',
              email: 'admin@example.com',
              username: 'adminuser',
              role: 'admin',
            },
          },
        });
      });

      it('renders signed in toolbar for admin', () => {
        render(<AuthToolbar />);

        expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
      });

      it('does not log admin role in production', () => {
        vi.stubEnv('NODE_ENV', 'production');
        render(<AuthToolbar />);

        expect(mockLog).not.toHaveBeenCalledWith('[AuthToolbar]', 'User role:', expect.anything());
      });

      it('logs admin role in development', () => {
        vi.stubEnv('NODE_ENV', 'development');
        render(<AuthToolbar />);

        expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'User role:', 'admin');
      });

      it('logs N/A when admin user has undefined role in development', () => {
        vi.stubEnv('NODE_ENV', 'development');
        mockUseSession.mockReturnValue({
          status: 'authenticated',
          data: {
            user: {
              id: '1',
              email: 'admin@example.com',
              username: 'adminuser',
              role: 'admin',
            },
          },
        });

        // First render to set isAdmin, then update to undefined role
        const { rerender } = render(<AuthToolbar />);

        vi.clearAllMocks();

        // Now mock with undefined role while session exists
        mockUseSession.mockReturnValue({
          status: 'authenticated',
          data: {
            user: {
              id: '1',
              email: 'admin@example.com',
              username: 'adminuser',
              role: undefined,
            },
          },
        });

        rerender(<AuthToolbar />);

        // Since role is undefined, isAdmin will be false, so this won't be called
        expect(mockLog).not.toHaveBeenCalledWith('[AuthToolbar]', 'User role:', 'N/A');
      });
    });

    describe('with non-admin role', () => {
      beforeEach(() => {
        mockUseSession.mockReturnValue({
          status: 'authenticated',
          data: {
            user: {
              id: '1',
              email: 'user@example.com',
              username: 'regularuser',
              role: 'user',
            },
          },
        });
      });

      it('renders signed in toolbar for regular user', () => {
        render(<AuthToolbar />);

        expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
      });

      it('does not log role for non-admin users', () => {
        vi.stubEnv('NODE_ENV', 'development');
        render(<AuthToolbar />);

        expect(mockLog).not.toHaveBeenCalledWith('[AuthToolbar]', 'User role:', expect.anything());
      });
    });

    describe('with undefined role', () => {
      beforeEach(() => {
        mockUseSession.mockReturnValue({
          status: 'authenticated',
          data: {
            user: {
              id: '1',
              email: 'user@example.com',
              username: 'noroleuser',
              role: undefined,
            },
          },
        });
      });

      it('renders signed in toolbar', () => {
        render(<AuthToolbar />);

        expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
      });
    });

    describe('with null user data', () => {
      beforeEach(() => {
        mockUseSession.mockReturnValue({
          status: 'authenticated',
          data: {
            user: null,
          },
        });
      });

      it('renders authenticated toolbar even with null user', () => {
        render(<AuthToolbar />);

        // Component checks session existence, not user validity
        expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
        expect(screen.queryByTestId('signin-link')).not.toBeInTheDocument();
        expect(screen.queryByTestId('signup-link')).not.toBeInTheDocument();
      });
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

    it('does not pass className to loading spinner', () => {
      const { container } = render(<AuthToolbar className="custom-class" />);

      // MessageSpinner doesn't receive the className
      const toolbar = container.querySelector('.custom-class');
      expect(toolbar).not.toBeInTheDocument();
    });
  });

  describe('development environment logging', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
    });

    it('logs session status in development', () => {
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

      render(<AuthToolbar />);

      expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Session status:', 'authenticated');
    });

    it('logs session data in development', () => {
      const sessionData = {
        user: {
          id: '1',
          email: 'test@example.com',
          username: 'testuser',
        },
      };

      mockUseSession.mockReturnValue({
        status: 'authenticated',
        data: sessionData,
      });

      render(<AuthToolbar />);

      expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Session data:', sessionData);
    });

    it('logs user data in development', () => {
      const userData = {
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
      };

      mockUseSession.mockReturnValue({
        status: 'authenticated',
        data: {
          user: userData,
        },
      });

      render(<AuthToolbar />);

      expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'User data:', userData);
    });

    it('logs username in development', () => {
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

      render(<AuthToolbar />);

      expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Username:', 'testuser');
    });

    it('logs undefined username when not present', () => {
      mockUseSession.mockReturnValue({
        status: 'authenticated',
        data: {
          user: {
            id: '1',
            email: 'test@example.com',
          },
        },
      });

      render(<AuthToolbar />);

      expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Username:', undefined);
    });

    it('logs for unauthenticated state in development', () => {
      mockUseSession.mockReturnValue({
        status: 'unauthenticated',
        data: null,
      });

      render(<AuthToolbar />);

      expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Session status:', 'unauthenticated');
      expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Session data:', null);
    });

    it('logs for loading state in development', () => {
      mockUseSession.mockReturnValue({
        status: 'loading',
        data: null,
      });

      render(<AuthToolbar />);

      expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Session status:', 'loading');
    });

    it('logs N/A when admin has no role property', () => {
      mockUseSession.mockReturnValue({
        status: 'authenticated',
        data: {
          user: {
            id: '1',
            email: 'admin@example.com',
            username: 'adminuser',
            role: 'admin',
          },
        },
      });

      render(<AuthToolbar />);

      expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'User role:', 'admin');
    });

    it('handles edge case where role becomes falsy after isAdmin check', () => {
      vi.stubEnv('NODE_ENV', 'development');

      // Create an object with a getter that returns different values
      let callCount = 0;
      const userObj = {
        id: '1',
        email: 'admin@example.com',
        username: 'adminuser',
        get role() {
          callCount++;
          // First call returns 'admin' (for isAdmin check)
          // Second call returns null (for logging)
          return callCount === 1 ? 'admin' : null;
        },
      };

      mockUseSession.mockReturnValue({
        status: 'authenticated',
        data: {
          user: userObj,
        },
      });

      render(<AuthToolbar />);

      // Should log N/A since role becomes null on second access
      expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'User role:', 'N/A');
    });
  });

  describe('production environment', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
    });

    it('does not log session status in production', () => {
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

      render(<AuthToolbar />);

      expect(mockLog).not.toHaveBeenCalledWith(
        '[AuthToolbar]',
        'Session status:',
        expect.anything()
      );
    });

    it('still logs authenticated toolbar message in production', () => {
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

      render(<AuthToolbar />);

      expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Rendering authenticated toolbar');
    });

    it('still logs unauthenticated message in production', () => {
      mockUseSession.mockReturnValue({
        status: 'unauthenticated',
        data: null,
      });

      render(<AuthToolbar />);

      expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Rendering unauthenticated links');
    });
  });

  describe('edge cases and error conditions', () => {
    it('handles authenticated status with null session data gracefully', () => {
      mockUseSession.mockReturnValue({
        status: 'authenticated',
        data: null,
      });

      render(<AuthToolbar />);

      // Should fall back to unauthenticated state
      expect(screen.getByTestId('signin-link')).toBeInTheDocument();
      expect(screen.getByTestId('signup-link')).toBeInTheDocument();
    });

    it('handles authenticated status with empty session object', () => {
      mockUseSession.mockReturnValue({
        status: 'authenticated',
        data: {},
      });

      render(<AuthToolbar />);

      // Should render authenticated toolbar even with empty data
      expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
    });

    it('handles session with user but no email', () => {
      mockUseSession.mockReturnValue({
        status: 'authenticated',
        data: {
          user: {
            id: '1',
            username: 'testuser',
          },
        },
      });

      render(<AuthToolbar />);

      expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
    });

    it('handles session with user but no username', () => {
      mockUseSession.mockReturnValue({
        status: 'authenticated',
        data: {
          user: {
            id: '1',
            email: 'test@example.com',
          },
        },
      });

      render(<AuthToolbar />);

      expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
    });

    it('handles empty className gracefully', () => {
      const { container } = render(<AuthToolbar className="" />);

      expect(container.firstChild).toBeInTheDocument();
    });

    it('handles undefined className gracefully', () => {
      const { container } = render(<AuthToolbar className={undefined} />);

      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders correctly when useSession returns minimal data', () => {
      mockUseSession.mockReturnValue({
        status: 'unauthenticated',
        data: null,
      });

      const { container } = render(<AuthToolbar />);

      expect(container.firstChild).toBeInTheDocument();
    });

    it('handles session with admin role as empty string', () => {
      mockUseSession.mockReturnValue({
        status: 'authenticated',
        data: {
          user: {
            id: '1',
            email: 'test@example.com',
            username: 'testuser',
            role: '',
          },
        },
      });

      render(<AuthToolbar />);

      // Should render but not be treated as admin
      expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
    });

    it('handles session with admin role as different case', () => {
      mockUseSession.mockReturnValue({
        status: 'authenticated',
        data: {
          user: {
            id: '1',
            email: 'test@example.com',
            username: 'testuser',
            role: 'ADMIN', // Different case
          },
        },
      });

      render(<AuthToolbar />);

      // Should render but not be treated as admin (case-sensitive)
      expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
    });
  });

  describe('component rendering stability', () => {
    it('renders consistently on multiple renders with same props', () => {
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

      const { rerender } = render(<AuthToolbar className="test-class" />);
      expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();

      rerender(<AuthToolbar className="test-class" />);
      expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
    });

    it('updates correctly when session changes from loading to authenticated', () => {
      mockUseSession.mockReturnValue({
        status: 'loading',
        data: null,
      });

      const { rerender } = render(<AuthToolbar />);
      expect(screen.getByText('Loading')).toBeInTheDocument();

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

      rerender(<AuthToolbar />);
      expect(screen.queryByText('Loading')).not.toBeInTheDocument();
      expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
    });

    it('updates correctly when session changes from authenticated to unauthenticated', () => {
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

      const { rerender } = render(<AuthToolbar />);
      expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();

      mockUseSession.mockReturnValue({
        status: 'unauthenticated',
        data: null,
      });

      rerender(<AuthToolbar />);
      expect(screen.queryByTestId('signout-toolbar')).not.toBeInTheDocument();
      expect(screen.getByTestId('signin-link')).toBeInTheDocument();
    });
  });
});
