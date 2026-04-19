/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import SignedinToolbar from './signout-button';

// Mock next-auth
const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}));

// Mock use-mobile hook
const mockUseIsMobile = vi.fn();
vi.mock('@/app/hooks/use-mobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

// Mock child components
vi.mock('./signed-in-as', () => ({
  default: ({ onClick }: { onClick?: () => void }) => (
    <div data-testid="signed-in-as">
      <button data-testid="signed-in-as-action" onClick={onClick}>
        Signed In As
      </button>
    </div>
  ),
}));

vi.mock('./edit-profile-button', () => ({
  default: () => <div data-testid="edit-profile-button">Edit Profile Button</div>,
}));

vi.mock('./admin-link', () => ({
  default: ({ onClick }: { onClick?: () => void }) => (
    <button data-testid="admin-link" onClick={onClick}>
      Admin Link
    </button>
  ),
}));

vi.mock('./sign-out-button', () => ({
  SignOutButton: ({ onNavigate }: { onNavigate?: () => void }) => (
    <button data-testid="sign-out-button" onClick={onNavigate}>
      Sign Out
    </button>
  ),
}));

vi.mock('../ui/vertical-separator', () => ({
  default: () => <div data-testid="vertical-separator">|</div>,
}));

vi.mock('../gravatar-avatar', () => ({
  GravatarAvatar: ({
    email,
    firstName,
    surname,
  }: {
    email: string;
    firstName?: string;
    surname?: string;
  }) => (
    <div
      data-testid="gravatar-avatar"
      data-email={email}
      data-first={firstName}
      data-last={surname}
    >
      Avatar
    </div>
  ),
}));

// Mock utils
vi.mock('@/lib/utils/tailwind-utils', () => ({
  cn: (...args: Array<string | Record<string, boolean> | undefined>) => {
    return args
      .filter(Boolean)
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (typeof arg === 'object' && arg !== null) {
          return Object.keys(arg)
            .filter((key) => arg[key])
            .join(' ');
        }
        return '';
      })
      .filter(Boolean)
      .join(' ');
  },
}));

describe('SignedinToolbar', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: '1',
          name: 'Test User',
          email: 'test@example.com',
          role: 'user',
        },
      },
      status: 'authenticated',
    });
    mockUseIsMobile.mockReturnValue(false);
  });

  describe('rendering', () => {
    it('renders all child components on desktop', () => {
      mockUseIsMobile.mockReturnValue(false);
      render(<SignedinToolbar />);

      expect(screen.getByTestId('gravatar-avatar')).toBeInTheDocument();
      expect(screen.getByTestId('signed-in-as')).toBeInTheDocument();
      expect(screen.getByTestId('sign-out-button')).toBeInTheDocument();
      expect(screen.getByTestId('edit-profile-button')).toBeInTheDocument();
    });

    it('renders gravatar avatar with session data', () => {
      render(<SignedinToolbar />);

      const avatar = screen.getByTestId('gravatar-avatar');
      expect(avatar).toHaveAttribute('data-email', 'test@example.com');
      expect(avatar).toHaveAttribute('data-first', 'Test');
      expect(avatar).toHaveAttribute('data-last', 'User');
    });

    it('renders vertical separator on desktop', () => {
      mockUseIsMobile.mockReturnValue(false);
      render(<SignedinToolbar />);

      expect(screen.getByTestId('vertical-separator')).toBeInTheDocument();
    });

    it('hides vertical separator on mobile', () => {
      mockUseIsMobile.mockReturnValue(true);
      render(<SignedinToolbar />);

      expect(screen.queryByTestId('vertical-separator')).not.toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(<SignedinToolbar className="custom-class" />);

      const wrapper = container.querySelector('.custom-class');
      expect(wrapper).toBeInTheDocument();
    });
  });

  describe('admin functionality', () => {
    it('shows admin link when user is admin', () => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            id: '1',
            name: 'Admin User',
            email: 'admin@example.com',
            role: 'admin',
          },
        },
        status: 'authenticated',
      });
      render(<SignedinToolbar />);

      expect(screen.getByTestId('admin-link')).toBeInTheDocument();
    });

    it('hides admin link when user is not admin', () => {
      render(<SignedinToolbar />);

      expect(screen.queryByTestId('admin-link')).not.toBeInTheDocument();
    });
  });

  describe('navigation callbacks', () => {
    it('passes onNavigate to SignOutButton', () => {
      const onNavigate = vi.fn();
      render(<SignedinToolbar onNavigate={onNavigate} />);

      screen.getByTestId('sign-out-button').click();
      expect(onNavigate).toHaveBeenCalledOnce();
    });

    it('passes onNavigate to SignedInAs', () => {
      const onNavigate = vi.fn();
      render(<SignedinToolbar onNavigate={onNavigate} />);

      screen.getByTestId('signed-in-as-action').click();
      expect(onNavigate).toHaveBeenCalledOnce();
    });

    it('passes onNavigate to AdminLink when admin', () => {
      const onNavigate = vi.fn();
      mockUseSession.mockReturnValue({
        data: {
          user: {
            id: '1',
            name: 'Admin User',
            email: 'admin@example.com',
            role: 'admin',
          },
        },
        status: 'authenticated',
      });
      render(<SignedinToolbar onNavigate={onNavigate} />);

      screen.getByTestId('admin-link').click();
      expect(onNavigate).toHaveBeenCalledOnce();
    });
  });
});
