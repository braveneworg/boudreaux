import { render, screen } from '@testing-library/react';

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

// Mock lucide-react
vi.mock('lucide-react', () => ({
  KeyIcon: ({ size, className }: { size?: number; className?: string }) => (
    <div data-testid="key-icon" data-size={size} className={className}>
      KeyIcon
    </div>
  ),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

// Mock utils
vi.mock('@/lib/utils', () => ({
  cn: (...args: Array<string | Record<string, boolean> | undefined>) => {
    return args
      .filter(Boolean)
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (typeof arg === 'object' && arg !== null) {
          return Object.keys(arg)
            .filter((key) => (arg as Record<string, boolean>)[key])
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

    it('renders the signed in text on desktop', () => {
      mockUseIsMobile.mockReturnValue(false);
      render(<SignedInAs />);

      expect(screen.getByText('Signed in as:')).toBeInTheDocument();
    });

    it('renders the key icon with correct size', () => {
      mockUseIsMobile.mockReturnValue(false);
      render(<SignedInAs />);

      const icons = screen.getAllByTestId('key-icon');
      expect(icons.length).toBeGreaterThan(0);
      expect(icons[0]).toHaveAttribute('data-size', '16');
    });

    it('renders the username link with @ prefix', () => {
      mockUseIsMobile.mockReturnValue(false);
      render(<SignedInAs />);

      const link = screen.getByRole('link', { name: /@testuser/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/profile');
    });

    it('applies consistent flex layout', () => {
      mockUseIsMobile.mockReturnValue(true);
      const { container } = render(<SignedInAs />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex');
      expect(wrapper).toHaveClass('items-center');
      expect(wrapper).toHaveClass('gap-2');
    });

    it('applies underline and text-zinc-50 classes', () => {
      mockUseIsMobile.mockReturnValue(false);
      const { container } = render(<SignedInAs />);

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('underline');
      expect(wrapper).toHaveClass('text-zinc-50');
    });

    it('hides "Signed in as:" text on mobile', () => {
      mockUseIsMobile.mockReturnValue(true);
      render(<SignedInAs />);

      expect(screen.queryByText('Signed in as:')).not.toBeInTheDocument();
    });

    it('shows mobile key icon with md:hidden class', () => {
      mockUseIsMobile.mockReturnValue(true);
      render(<SignedInAs />);

      const icons = screen.getAllByTestId('key-icon');
      const mobileIcon = icons.find((icon) => icon.className.includes('md:hidden'));
      expect(mobileIcon).toBeDefined();
    });

    it('shows desktop key icon and signed-in text on desktop', () => {
      mockUseIsMobile.mockReturnValue(false);
      render(<SignedInAs />);

      expect(screen.getByText('Signed in as:')).toBeInTheDocument();
      // Desktop shows both icons: one in the flex-row section, one with md:hidden
      const icons = screen.getAllByTestId('key-icon');
      expect(icons).toHaveLength(2);
    });
  });

  describe('when user has no username', () => {
    it('displays name when username is undefined but name is available', () => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            name: 'Test User',
            email: 'test@example.com',
          },
        },
        status: 'authenticated',
      });
      mockUseIsMobile.mockReturnValue(false);

      render(<SignedInAs />);
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    it('displays email when username is undefined but email is available', () => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            email: 'test@example.com',
          },
        },
        status: 'authenticated',
      });
      mockUseIsMobile.mockReturnValue(false);

      render(<SignedInAs />);
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('displays email when username is null but email is available', () => {
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

      render(<SignedInAs />);
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('renders displayName without @ prefix when no username', () => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            name: 'Jane Doe',
          },
        },
        status: 'authenticated',
      });
      mockUseIsMobile.mockReturnValue(false);

      render(<SignedInAs />);
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      expect(screen.queryByText('@Jane Doe')).not.toBeInTheDocument();
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

    it('returns null and logs warning when no display name found', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockUseSession.mockReturnValue({
        data: {
          user: {},
        },
        status: 'authenticated',
      });
      mockUseIsMobile.mockReturnValue(false);

      const { container } = render(<SignedInAs />);
      expect(container.firstChild).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith('[SignedInAs] No display name found, returning null');

      warnSpy.mockRestore();
    });
  });

  describe('development logging', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('logs session info in development mode', () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      mockUseSession.mockReturnValue({
        data: {
          user: {
            username: 'devuser',
            email: 'dev@example.com',
          },
        },
        status: 'authenticated',
      });
      mockUseIsMobile.mockReturnValue(false);

      render(<SignedInAs />);

      expect(infoSpy).toHaveBeenCalledWith(
        '[SignedInAs] Session:',
        expect.objectContaining({ user: expect.objectContaining({ username: 'devuser' }) })
      );
      expect(infoSpy).toHaveBeenCalledWith(
        '[SignedInAs] User:',
        expect.objectContaining({ username: 'devuser' })
      );
      expect(infoSpy).toHaveBeenCalledWith('[SignedInAs] Display name:', 'devuser');

      infoSpy.mockRestore();
    });

    it('logs session info when session is null in development', () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
      });
      mockUseIsMobile.mockReturnValue(false);

      render(<SignedInAs />);

      expect(infoSpy).toHaveBeenCalledWith('[SignedInAs] Session:', null);

      infoSpy.mockRestore();
    });
  });

  describe('link styling', () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        data: {
          user: {
            username: 'testuser',
          },
        },
        status: 'authenticated',
      });
      mockUseIsMobile.mockReturnValue(false);
    });

    it('profile link has correct classes', () => {
      render(<SignedInAs />);

      const link = screen.getByRole('link');
      expect(link).toHaveClass('text-sm');
      expect(link).toHaveClass('text-zinc-50');
    });

    it('profile link points to /profile', () => {
      render(<SignedInAs />);

      expect(screen.getByRole('link')).toHaveAttribute('href', '/profile');
    });
  });
});
