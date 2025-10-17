import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import SignedInAs from './signed-in-as';

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

// Mock UsernameLink component
vi.mock('./username-link', () => ({
  default: ({ username }: { username: string }) => (
    <div data-testid="username-link">@{username}</div>
  ),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  KeyIcon: ({ size }: { size?: number }) => (
    <div data-testid="key-icon" data-size={size}>
      KeyIcon
    </div>
  ),
}));

// Mock utils
vi.mock('@/app/lib/utils', () => ({
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

describe('SignedInAs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when user has username', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            username: 'testuser',
            email: 'test@example.com',
          },
        },
        status: 'authenticated',
      });
    });

    it('renders the signed in text', () => {
      mockUseIsMobile.mockReturnValue(false);
      render(<SignedInAs />);

      expect(screen.getByText('Signed in as:')).toBeInTheDocument();
    });

    it('renders the key icon with correct size', () => {
      mockUseIsMobile.mockReturnValue(false);
      render(<SignedInAs />);

      const icon = screen.getByTestId('key-icon');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveAttribute('data-size', '16');
    });

    it('renders the username link', () => {
      mockUseIsMobile.mockReturnValue(false);
      render(<SignedInAs />);

      expect(screen.getByTestId('username-link')).toBeInTheDocument();
      expect(screen.getByText('@testuser')).toBeInTheDocument();
    });

    it('applies mobile layout when on mobile', () => {
      mockUseIsMobile.mockReturnValue(true);
      const { container } = render(<SignedInAs />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex-col');
    });

    it('applies desktop layout when not on mobile', () => {
      mockUseIsMobile.mockReturnValue(false);
      const { container } = render(<SignedInAs />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex-row');
    });
  });

  describe('when user has no username', () => {
    it('returns null when username is undefined', () => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            email: 'test@example.com',
          },
        },
        status: 'authenticated',
      });
      mockUseIsMobile.mockReturnValue(false);

      const { container } = render(<SignedInAs />);
      expect(container.firstChild).toBeNull();
    });

    it('returns null when username is null', () => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            username: null,
            email: 'test@example.com',
          },
        },
        status: 'authenticated',
      });
      mockUseIsMobile.mockReturnValue(false);

      const { container } = render(<SignedInAs />);
      expect(container.firstChild).toBeNull();
    });

    it('returns null when user session is null', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
      });
      mockUseIsMobile.mockReturnValue(false);

      const { container } = render(<SignedInAs />);
      expect(container.firstChild).toBeNull();
    });
  });
});
