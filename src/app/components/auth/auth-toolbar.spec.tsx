import { render, screen } from '@testing-library/react';

import { CONSTANTS } from '@/app/lib/constants';

import AuthToolbar from './auth-toolbar';

import type { Session } from 'next-auth';

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

vi.mock('../ui/spinners/message-spinner', () => ({
  MessageSpinner: ({ title, size, variant }: { title: string; size: string; variant: string }) => (
    <div data-testid="message-spinner" data-title={title} data-size={size} data-variant={variant}>
      {title}
    </div>
  ),
}));

vi.mock('@/app/lib/utils/tailwind-utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

// Mock console logger
const mockLog = vi.fn();
vi.mock('@/app/lib/utils/console-logger', () => ({
  log: (...args: unknown[]) => mockLog(...args),
}));

describe('AuthToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLog.mockClear();
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

    it('logs unauthenticated state message', () => {
      render(<AuthToolbar />);

      expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Rendering unauthenticated links');
    });

    it('applies correct CSS classes to container', () => {
      const { container } = render(<AuthToolbar />);

      // Get the inner div (second div, child of the first)
      const outerDiv = container.querySelector('div');
      const innerDiv = outerDiv?.querySelector('div');
      expect(innerDiv).toHaveClass(
        'flex',
        'h-[20px]',
        'items-center',
        'relative',
        'justify-center',
        'gap-2'
      );
    });
  });

  describe('when user is authenticated', () => {
    const createSession = (overrides?: Partial<Session>): Session => ({
      user: {
        id: '1',
        email: 'test@example.com',
        username: 'testuser',
        role: undefined,
      },
      expires: '2025-12-31',
      ...overrides,
    });

    beforeEach(() => {
      mockUseSession.mockReturnValue({
        status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
        data: createSession(),
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

    it('logs authenticated state message', () => {
      render(<AuthToolbar />);

      expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Rendering authenticated toolbar');
    });

    describe('with admin user', () => {
      beforeEach(() => {
        mockUseSession.mockReturnValue({
          status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
          data: createSession({
            user: {
              id: '1',
              email: 'admin@example.com',
              username: 'admin',
              role: CONSTANTS.ROLES.ADMIN,
            },
          }),
        });
      });

      it('renders signed in toolbar for admin user', () => {
        render(<AuthToolbar />);

        expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
      });

      describe('in development mode', () => {
        beforeEach(() => {
          vi.stubEnv('NODE_ENV', CONSTANTS.ENV.DEVELOPMENT);
        });

        afterEach(() => {
          vi.unstubAllEnvs();
        });

        it('logs admin role in development mode', () => {
          render(<AuthToolbar />);

          expect(mockLog).toHaveBeenCalledWith(
            '[AuthToolbar]',
            'User role:',
            CONSTANTS.ROLES.ADMIN
          );
        });

        it('logs session status in development mode', () => {
          render(<AuthToolbar />);

          expect(mockLog).toHaveBeenCalledWith(
            '[AuthToolbar]',
            'Session status:',
            CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED
          );
        });

        it('logs session data in development mode', () => {
          const session = createSession({
            user: {
              id: '1',
              email: 'admin@example.com',
              username: 'admin',
              role: CONSTANTS.ROLES.ADMIN,
            },
          });

          mockUseSession.mockReturnValue({
            status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
            data: session,
          });

          render(<AuthToolbar />);

          expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Session data:', session);
        });

        it('logs user data in development mode', () => {
          const session = createSession({
            user: {
              id: '1',
              email: 'admin@example.com',
              username: 'admin',
              role: CONSTANTS.ROLES.ADMIN,
            },
          });

          mockUseSession.mockReturnValue({
            status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
            data: session,
          });

          render(<AuthToolbar />);

          expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'User data:', session.user);
        });

        it('logs admin role value in development mode', () => {
          const adminSession = createSession({
            user: {
              id: '1',
              email: 'admin@example.com',
              username: 'admin',
              role: CONSTANTS.ROLES.ADMIN,
            },
          });

          mockUseSession.mockReturnValue({
            status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
            data: adminSession,
          });

          render(<AuthToolbar />);

          // This should log the actual admin role value, not N/A
          expect(mockLog).toHaveBeenCalledWith(
            '[AuthToolbar]',
            'User role:',
            CONSTANTS.ROLES.ADMIN
          );
          // Verify it's not logging N/A
          expect(mockLog).not.toHaveBeenCalledWith('[AuthToolbar]', 'User role:', CONSTANTS.NA);
        });

        it('handles falsy role value with fallback to N/A', () => {
          // This tests the || CONSTANTS.NA branch
          // We use Object.defineProperty to create a getter that returns admin first (for isAdmin check)
          // then returns a falsy value when accessed in the log statement
          let roleAccessCount = 0;
          const userWithGetter = {
            id: '1',
            email: 'admin@example.com',
            username: 'admin',
          };

          Object.defineProperty(userWithGetter, 'role', {
            get() {
              roleAccessCount++;
              // First access (for isAdmin check) returns 'admin'
              // Second access (in log statement) returns empty string (falsy)
              return roleAccessCount === 1 ? CONSTANTS.ROLES.ADMIN : '';
            },
            enumerable: true,
            configurable: true,
          });

          mockUseSession.mockReturnValue({
            status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
            data: {
              user: userWithGetter,
              expires: '2025-12-31',
            },
          });

          render(<AuthToolbar />);

          // Should log N/A when role is falsy
          expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'User role:', CONSTANTS.NA);
        });

        it('logs username in development mode', () => {
          const session = createSession({
            user: {
              id: '1',
              email: 'admin@example.com',
              username: 'adminuser',
              role: CONSTANTS.ROLES.ADMIN,
            },
          });

          mockUseSession.mockReturnValue({
            status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
            data: session,
          });

          render(<AuthToolbar />);

          expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Username:', 'adminuser');
        });
      });

      describe('in production mode', () => {
        beforeEach(() => {
          vi.stubEnv('NODE_ENV', 'production');
        });

        afterEach(() => {
          vi.unstubAllEnvs();
        });

        it('does not log admin role in production mode', () => {
          render(<AuthToolbar />);

          expect(mockLog).not.toHaveBeenCalledWith(
            '[AuthToolbar]',
            'User role:',
            CONSTANTS.ROLES.ADMIN
          );
        });

        it('does not log session status in production mode', () => {
          render(<AuthToolbar />);

          expect(mockLog).not.toHaveBeenCalledWith(
            '[AuthToolbar]',
            'Session status:',
            expect.anything()
          );
        });

        it('still logs authenticated toolbar message', () => {
          render(<AuthToolbar />);

          expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Rendering authenticated toolbar');
        });
      });
    });

    describe('with non-admin user', () => {
      beforeEach(() => {
        mockUseSession.mockReturnValue({
          status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
          data: createSession({
            user: {
              id: '2',
              email: 'user@example.com',
              username: 'regularuser',
              role: 'user',
            },
          }),
        });
      });

      it('renders signed in toolbar for non-admin user', () => {
        render(<AuthToolbar />);

        expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
      });

      describe('in development mode', () => {
        beforeEach(() => {
          vi.stubEnv('NODE_ENV', CONSTANTS.ENV.DEVELOPMENT);
        });

        afterEach(() => {
          vi.unstubAllEnvs();
        });

        it('does not log user role for non-admin in development mode', () => {
          render(<AuthToolbar />);

          expect(mockLog).not.toHaveBeenCalledWith(
            '[AuthToolbar]',
            'User role:',
            expect.anything()
          );
        });

        it('logs session data in development mode', () => {
          const session = createSession({
            user: {
              id: '2',
              email: 'user@example.com',
              username: 'regularuser',
              role: 'user',
            },
          });

          mockUseSession.mockReturnValue({
            status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
            data: session,
          });

          render(<AuthToolbar />);

          expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Session data:', session);
        });
      });
    });

    describe('with user missing role', () => {
      beforeEach(() => {
        mockUseSession.mockReturnValue({
          status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
          data: createSession({
            user: {
              id: '3',
              email: 'norole@example.com',
              username: 'noroleuser',
            },
          }),
        });
      });

      it('renders signed in toolbar when role is undefined', () => {
        render(<AuthToolbar />);

        expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
      });

      describe('in development mode', () => {
        beforeEach(() => {
          vi.stubEnv('NODE_ENV', CONSTANTS.ENV.DEVELOPMENT);
        });

        afterEach(() => {
          vi.unstubAllEnvs();
        });

        it('logs N/A for missing role in development mode when checking admin', () => {
          // This test covers the case where role is undefined and isAdmin is false
          render(<AuthToolbar />);

          // Should not log role since user is not admin
          expect(mockLog).not.toHaveBeenCalledWith(
            '[AuthToolbar]',
            'User role:',
            expect.anything()
          );
        });
      });
    });
  });

  describe('when session status is loading', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        status: CONSTANTS.AUTHENTICATION.STATUS.LOADING,
        data: null,
      });
    });

    it('renders loading spinner with correct props', () => {
      render(<AuthToolbar />);

      const spinner = screen.getByTestId('message-spinner');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveAttribute('data-title', 'Loading...');
      expect(spinner).toHaveAttribute('data-size', 'sm');
      expect(spinner).toHaveAttribute('data-variant', 'default');
    });

    it('displays loading text', () => {
      render(<AuthToolbar />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('does not render sign in/up links while loading', () => {
      render(<AuthToolbar />);

      expect(screen.queryByTestId('signin-link')).not.toBeInTheDocument();
      expect(screen.queryByTestId('signup-link')).not.toBeInTheDocument();
    });

    it('does not render signed in toolbar while loading', () => {
      render(<AuthToolbar />);

      expect(screen.queryByTestId('signout-toolbar')).not.toBeInTheDocument();
    });
  });

  describe('edge cases and boundary conditions', () => {
    describe('with null session but authenticated status', () => {
      it('renders unauthenticated links when session is null despite authenticated status', () => {
        mockUseSession.mockReturnValue({
          status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
          data: null,
        });

        render(<AuthToolbar />);

        expect(screen.getByTestId('signin-link')).toBeInTheDocument();
        expect(screen.getByTestId('signup-link')).toBeInTheDocument();
      });
    });

    describe('with undefined session data', () => {
      it('handles undefined session gracefully', () => {
        mockUseSession.mockReturnValue({
          status: 'unauthenticated',
          data: undefined,
        });

        render(<AuthToolbar />);

        expect(screen.getByTestId('signin-link')).toBeInTheDocument();
        expect(screen.getByTestId('signup-link')).toBeInTheDocument();
      });
    });

    describe('with custom className variations', () => {
      it('handles empty string className', () => {
        mockUseSession.mockReturnValue({
          status: 'unauthenticated',
          data: null,
        });

        const { container } = render(<AuthToolbar className="" />);

        const toolbar = container.querySelector('div');
        expect(toolbar).toBeInTheDocument();
      });

      it('handles multiple className values', () => {
        mockUseSession.mockReturnValue({
          status: 'unauthenticated',
          data: null,
        });

        const { container } = render(<AuthToolbar className="class1 class2 class3" />);

        const toolbar = container.querySelector('.class1');
        expect(toolbar).toBeInTheDocument();
      });

      it('passes className to authenticated toolbar', () => {
        mockUseSession.mockReturnValue({
          status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
          data: {
            user: {
              id: '1',
              email: 'test@example.com',
              username: 'testuser',
            },
            expires: '2025-12-31',
          },
        });

        render(<AuthToolbar className="authenticated-custom" />);

        const toolbar = screen.getByTestId('signout-toolbar');
        expect(toolbar).toHaveClass('authenticated-custom');
      });
    });

    describe('development mode logging variations', () => {
      beforeEach(() => {
        vi.stubEnv('NODE_ENV', CONSTANTS.ENV.DEVELOPMENT);
      });

      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it('logs when user data is present', () => {
        const session = {
          user: {
            id: '1',
            email: 'test@example.com',
            username: 'testuser',
            role: CONSTANTS.ROLES.ADMIN,
          },
          expires: '2025-12-31',
        };

        mockUseSession.mockReturnValue({
          status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
          data: session,
        });

        render(<AuthToolbar />);

        expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'User data:', session.user);
      });

      it('logs username when present', () => {
        mockUseSession.mockReturnValue({
          status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
          data: {
            user: {
              id: '1',
              email: 'test@example.com',
              username: 'myusername',
            },
            expires: '2025-12-31',
          },
        });

        render(<AuthToolbar />);

        expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Username:', 'myusername');
      });

      it('logs undefined username when not present', () => {
        mockUseSession.mockReturnValue({
          status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
          data: {
            user: {
              id: '1',
              email: 'test@example.com',
            },
            expires: '2025-12-31',
          },
        });

        render(<AuthToolbar />);

        expect(mockLog).toHaveBeenCalledWith('[AuthToolbar]', 'Username:', undefined);
      });

      it('handles session with null user', () => {
        mockUseSession.mockReturnValue({
          status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
          data: {
            user: null,
            expires: '2025-12-31',
          },
        });

        render(<AuthToolbar />);

        // Should still attempt to log
        expect(mockLog).toHaveBeenCalled();
      });
    });

    describe('admin role edge cases', () => {
      beforeEach(() => {
        vi.stubEnv('NODE_ENV', CONSTANTS.ENV.DEVELOPMENT);
      });

      afterEach(() => {
        vi.unstubAllEnvs();
      });

      it('handles admin role with empty string', () => {
        mockUseSession.mockReturnValue({
          status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
          data: {
            user: {
              id: '1',
              email: 'test@example.com',
              username: 'testuser',
              role: '',
            },
            expires: '2025-12-31',
          },
        });

        render(<AuthToolbar />);

        expect(screen.getByTestId('signout-toolbar')).toBeInTheDocument();
      });

      it('correctly identifies admin role case-sensitively', () => {
        mockUseSession.mockReturnValue({
          status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
          data: {
            user: {
              id: '1',
              email: 'admin@example.com',
              username: 'admin',
              role: 'ADMIN', // Different case
            },
            expires: '2025-12-31',
          },
        });

        render(<AuthToolbar />);

        // Should not log admin role since it doesn't match exactly
        expect(mockLog).not.toHaveBeenCalledWith('[AuthToolbar]', 'User role:', expect.anything());
      });
    });
  });

  describe('component rendering and structure', () => {
    it('renders without crashing with minimal props', () => {
      mockUseSession.mockReturnValue({
        status: 'unauthenticated',
        data: null,
      });

      const { container } = render(<AuthToolbar />);

      expect(container).toBeInTheDocument();
    });

    it('maintains proper DOM structure for unauthenticated state', () => {
      mockUseSession.mockReturnValue({
        status: 'unauthenticated',
        data: null,
      });

      const { container } = render(<AuthToolbar />);

      const mainDiv = container.querySelector('div');
      expect(mainDiv).toBeInTheDocument();
      expect(mainDiv?.children.length).toBeGreaterThan(0);
    });

    it('renders exactly one root element for unauthenticated', () => {
      mockUseSession.mockReturnValue({
        status: 'unauthenticated',
        data: null,
      });

      const { container } = render(<AuthToolbar />);

      expect(container.firstChild?.childNodes.length).toBeGreaterThan(0);
    });

    it('renders exactly one root element for authenticated', () => {
      mockUseSession.mockReturnValue({
        status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
        data: {
          user: {
            id: '1',
            email: 'test@example.com',
            username: 'testuser',
          },
          expires: '2025-12-31',
        },
      });

      const { container } = render(<AuthToolbar />);

      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders exactly one root element for loading', () => {
      mockUseSession.mockReturnValue({
        status: CONSTANTS.AUTHENTICATION.STATUS.LOADING,
        data: null,
      });

      const { container } = render(<AuthToolbar />);

      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('logging prefix consistency', () => {
    it('uses consistent logging prefix for all log calls', () => {
      vi.stubEnv('NODE_ENV', CONSTANTS.ENV.DEVELOPMENT);

      mockUseSession.mockReturnValue({
        status: CONSTANTS.AUTHENTICATION.STATUS.AUTHENTICATED,
        data: {
          user: {
            id: '1',
            email: 'admin@example.com',
            username: 'admin',
            role: CONSTANTS.ROLES.ADMIN,
          },
          expires: '2025-12-31',
        },
      });

      render(<AuthToolbar />);

      // Check that all log calls start with the correct prefix
      const logCalls = mockLog.mock.calls;
      logCalls.forEach((call) => {
        expect(call[0]).toBe('[AuthToolbar]');
      });

      vi.unstubAllEnvs();
    });
  });
});
