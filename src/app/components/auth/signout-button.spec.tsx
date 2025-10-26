import React from 'react';

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import SignedinToolbar from './signout-button';

// Mock next-auth
const mockSignOut = vi.fn();
const mockUseSession = vi.fn();
vi.mock('next-auth/react', () => ({
  signOut: (options?: { redirect?: boolean }) => mockSignOut(options),
  useSession: () => mockUseSession(),
}));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock use-mobile hook
const mockUseIsMobile = vi.fn();
vi.mock('@/app/hooks/use-mobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

// Mock child components
vi.mock('./signed-in-as', () => ({
  default: () => <div data-testid="signed-in-as">Signed In As Component</div>,
}));

vi.mock('./edit-profile-button', () => ({
  default: () => <div data-testid="edit-profile-button">Edit Profile Button</div>,
}));

vi.mock('./admin-link', () => ({
  default: () => <div data-testid="admin-link">Admin Link</div>,
}));

vi.mock('../ui/vertical-separator', () => ({
  default: () => <div data-testid="vertical-separator">|</div>,
}));

vi.mock('../ui/button', () => ({
  Button: ({
    children,
    onClick,
    variant,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
  }) => (
    <button onClick={onClick} data-variant={variant}>
      {children}
    </button>
  ),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  LogOutIcon: () => <div data-testid="logout-icon">LogOutIcon</div>,
  ShieldUser: () => <div data-testid="shield-user-icon">ShieldUser</div>,
}));

// Mock utils
vi.mock('@/app/lib/utils/auth/tailwind-utils', () => ({
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
    vi.clearAllMocks();
    // Set up default session mock
    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: '1',
          email: 'test@example.com',
          name: 'Test User',
          role: 'user',
        },
      },
      status: 'authenticated',
    });
  });

  describe('rendering', () => {
    it('renders all components on desktop', () => {
      mockUseIsMobile.mockReturnValue(false);
      render(<SignedinToolbar />);

      expect(screen.getByTestId('signed-in-as')).toBeInTheDocument();
      expect(screen.getByTestId('edit-profile-button')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
      expect(screen.getAllByTestId('vertical-separator')).toHaveLength(2);
    });

    it('renders without vertical separators on mobile', () => {
      mockUseIsMobile.mockReturnValue(true);
      render(<SignedinToolbar />);

      expect(screen.getByTestId('signed-in-as')).toBeInTheDocument();
      expect(screen.getByTestId('edit-profile-button')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
      expect(screen.queryAllByTestId('vertical-separator')).toHaveLength(0);
    });

    it('renders logout icon', () => {
      mockUseIsMobile.mockReturnValue(false);
      render(<SignedinToolbar />);

      expect(screen.getByTestId('logout-icon')).toBeInTheDocument();
    });

    it('applies flex-row layout on desktop', () => {
      mockUseIsMobile.mockReturnValue(false);
      const { container } = render(<SignedinToolbar />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex-row');
    });

    it('applies flex-col layout on mobile', () => {
      mockUseIsMobile.mockReturnValue(true);
      const { container } = render(<SignedinToolbar />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex-col');
    });

    it('applies custom className when provided', () => {
      mockUseIsMobile.mockReturnValue(false);
      const { container } = render(<SignedinToolbar className="custom-class" />);

      const wrapper = container.querySelector('.custom-class');
      expect(wrapper).toBeInTheDocument();
    });
  });

  describe('sign out functionality', () => {
    it('calls signOut with redirect: false and callbackUrl when sign out button is clicked', async () => {
      mockUseIsMobile.mockReturnValue(false);
      mockSignOut.mockResolvedValue({ url: '/' });
      render(<SignedinToolbar />);

      const signOutButton = screen.getByRole('button', { name: /sign out/i });
      fireEvent.click(signOutButton);

      // Wait for async signOut to be called
      await vi.waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledWith({ redirect: false, callbackUrl: '/' });
      });
    });

    it('navigates to URL returned from signOut', async () => {
      mockUseIsMobile.mockReturnValue(false);
      mockSignOut.mockResolvedValue({ url: '/custom-url' });
      render(<SignedinToolbar />);

      const signOutButton = screen.getByRole('button', { name: /sign out/i });
      fireEvent.click(signOutButton);

      // Wait for async operations to complete
      await vi.waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/custom-url');
      });
    });

    it('handles sign out click on mobile', async () => {
      mockUseIsMobile.mockReturnValue(true);
      mockSignOut.mockResolvedValue({ url: '/' });
      render(<SignedinToolbar />);

      const signOutButton = screen.getByRole('button', { name: /sign out/i });
      fireEvent.click(signOutButton);

      await vi.waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledWith({ redirect: false, callbackUrl: '/' });
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });
  });

  describe('button variant', () => {
    it('applies link:narrow variant to sign out button', () => {
      mockUseIsMobile.mockReturnValue(false);
      render(<SignedinToolbar />);

      const signOutButton = screen.getByRole('button', { name: /sign out/i });
      expect(signOutButton).toHaveAttribute('data-variant', 'link:narrow');
    });
  });

  describe('admin functionality', () => {
    it('renders AdminLink when user is admin', () => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            id: '1',
            email: 'admin@test.com',
            username: 'admin',
            role: 'admin',
          },
        },
        status: 'authenticated',
      });
      mockUseIsMobile.mockReturnValue(false);
      render(<SignedinToolbar />);

      expect(screen.getByTestId('admin-link')).toBeInTheDocument();
    });

    it('does not render AdminLink when user is not admin', () => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            id: '1',
            email: 'user@test.com',
            username: 'user',
            role: 'user',
          },
        },
        status: 'authenticated',
      });
      mockUseIsMobile.mockReturnValue(false);
      render(<SignedinToolbar />);

      expect(screen.queryByTestId('admin-link')).not.toBeInTheDocument();
    });

    it('does not render AdminLink when user has no role', () => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            id: '1',
            email: 'user@test.com',
            username: 'user',
          },
        },
        status: 'authenticated',
      });
      mockUseIsMobile.mockReturnValue(false);
      render(<SignedinToolbar />);

      expect(screen.queryByTestId('admin-link')).not.toBeInTheDocument();
    });
  });
});
