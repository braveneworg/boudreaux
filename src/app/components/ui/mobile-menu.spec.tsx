/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { NavMenuEntry } from '@/hooks/use-nav-menu-groups';

import { MobileMenu } from './mobile-menu';

const mockUsePathname = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

// Mock next/link to surface the prefetch posture as data attributes (Link
// behavior, not DOM attributes — the real component hides them). Event props
// (onClick) still spread onto the anchor so navigation tests keep working.
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    prefetch,
    unstable_dynamicOnHover,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    prefetch?: boolean;
    unstable_dynamicOnHover?: boolean;
  }) => (
    <a
      href={href}
      data-prefetch={prefetch === undefined ? 'default' : String(prefetch)}
      data-dynamic-on-hover={String(unstable_dynamicOnHover === true)}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock('../auth/auth-toolbar', () => ({
  AuthToolbar: ({ onNavigate }: { onNavigate?: () => void }) => (
    <button data-testid="auth-toolbar-action" onClick={onNavigate}>
      Auth Toolbar
    </button>
  ),
}));

vi.mock('./social-media-icon-links', () => ({
  SocialMediaIconLinks: () => <div data-testid="social-links" />,
}));

const entries: NavMenuEntry[] = [
  {
    kind: 'link',
    item: {
      name: 'Home',
      href: '/',
      color:
        'aria-[current=page]:text-menu-item-yellow-400 hover:text-menu-item-yellow-400 hover:decoration-menu-item-yellow-400',
    },
  },
  {
    kind: 'group',
    group: {
      label: 'Music',
      items: [
        {
          name: 'Releases',
          href: '/releases',
          color: 'aria-[current=page]:text-menu-item-cyan-400 hover:text-menu-item-cyan-400',
        },
        {
          name: 'Artists',
          href: '/artists',
          color: 'aria-[current=page]:text-menu-item-pink-300 hover:text-menu-item-pink-300',
        },
      ],
    },
  },
  {
    kind: 'group',
    group: {
      label: 'Label',
      items: [
        {
          name: 'Tours',
          href: '/tours',
          color: 'aria-[current=page]:text-menu-item-tan-200 hover:text-menu-item-tan-200',
        },
      ],
    },
  },
  {
    kind: 'link',
    item: {
      name: 'Contact Us',
      href: '/contact',
      color: 'aria-[current=page]:text-menu-item-orange-300 hover:text-menu-item-orange-300',
    },
  },
];

describe('MobileMenu', () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue('/');
    // Prevent jsdom "Not implemented: navigation" errors from anchor clicks.
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'A' || target.closest('a')) {
        e.preventDefault();
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  });

  it('renders the main navigation landmark', () => {
    render(<MobileMenu entries={entries} onNavigate={vi.fn()} />);

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('renders top-level link entries with their hrefs', () => {
    render(<MobileMenu entries={entries} onNavigate={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Contact Us' })).toHaveAttribute('href', '/contact');
  });

  it('renders group entries as collapsed disclosure triggers', () => {
    render(<MobileMenu entries={entries} onNavigate={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Label' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('hides grouped children until their category is expanded', () => {
    render(<MobileMenu entries={entries} onNavigate={vi.fn()} />);

    expect(screen.queryByRole('link', { name: 'Releases' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tours' })).not.toBeInTheDocument();
  });

  it('expands a category on trigger click', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<MobileMenu entries={entries} onNavigate={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Music' }));

    expect(screen.getByRole('link', { name: 'Releases' })).toHaveAttribute('href', '/releases');
    expect(screen.getByRole('link', { name: 'Artists' })).toHaveAttribute('href', '/artists');
  });

  it('collapses the open category when another one is expanded', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<MobileMenu entries={entries} onNavigate={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Music' }));
    await user.click(screen.getByRole('button', { name: 'Label' }));

    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Releases' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tours' })).toBeInTheDocument();
  });

  it('collapses an open category when its trigger is clicked again', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<MobileMenu entries={entries} onNavigate={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Music' }));
    await user.click(screen.getByRole('button', { name: 'Music' }));

    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Releases' })).not.toBeInTheDocument();
  });

  it('auto-opens the category containing the active route', () => {
    mockUsePathname.mockReturnValue('/releases');
    render(<MobileMenu entries={entries} onNavigate={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Releases' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Label' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts with every category collapsed on non-grouped routes', () => {
    mockUsePathname.mockReturnValue('/contact');
    render(<MobileMenu entries={entries} onNavigate={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Label' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps the white base under a state-scoped color so it shows when idle', () => {
    render(<MobileMenu entries={entries} onNavigate={vi.fn()} />);

    const link = screen.getByRole('link', { name: 'Home' });
    expect(link).toHaveClass('text-zinc-50');
    expect(link).toHaveClass('hover:text-menu-item-yellow-400');
  });

  it('marks the active top-level link with aria-current=page', () => {
    render(<MobileMenu entries={entries} onNavigate={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Contact Us' })).not.toHaveAttribute('aria-current');
  });

  it('keeps default viewport prefetching plus the touch-intent boost on links', () => {
    render(<MobileMenu entries={entries} onNavigate={vi.fn()} />);

    screen.getAllByRole('link').forEach((link) => {
      expect(link).toHaveAttribute('data-prefetch', 'default');
      expect(link).toHaveAttribute('data-dynamic-on-hover', 'true');
    });
  });

  it('calls onNavigate when a top-level link is clicked', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<MobileMenu entries={entries} onNavigate={onNavigate} />);

    await user.click(screen.getByRole('link', { name: 'Home' }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('calls onNavigate when an expanded child link is clicked', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<MobileMenu entries={entries} onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: 'Music' }));
    await user.click(screen.getByRole('link', { name: 'Releases' }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('wires onNavigate into the auth toolbar', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<MobileMenu entries={entries} onNavigate={onNavigate} />);

    await user.click(screen.getByTestId('auth-toolbar-action'));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('renders every entry inside a single list', () => {
    render(<MobileMenu entries={entries} onNavigate={vi.fn()} />);

    expect(screen.getAllByRole('list')).toHaveLength(1);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('staggers each top-level entry via an incremental animation delay', () => {
    render(<MobileMenu entries={entries} onNavigate={vi.fn()} />);

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveStyle({ animationDelay: '0s' });
    expect(items[1]).toHaveStyle({ animationDelay: '0.1s' });
    expect(items[2]).toHaveStyle({ animationDelay: '0.2s' });
    expect(items[3]).toHaveStyle({ animationDelay: '0.3s' });
  });

  it('applies the menu-item-stagger class to each top-level entry', () => {
    render(<MobileMenu entries={entries} onNavigate={vi.fn()} />);

    screen.getAllByRole('listitem').forEach((item) => {
      expect(item).toHaveClass('menu-item-stagger');
    });
  });
});
