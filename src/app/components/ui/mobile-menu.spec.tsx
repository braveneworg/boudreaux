/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MobileMenu } from './mobile-menu';

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

describe('MobileMenu', () => {
  // The global next/navigation mock resolves usePathname() to '/'.
  const menuItems = [
    { name: 'Home', href: '/' },
    { name: 'Tours', href: '/tours', color: 'text-menu-item-tan-200' },
    { name: 'About', href: '/about' },
  ];

  beforeEach(() => {
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
    render(<MobileMenu menuItems={menuItems} onNavigate={vi.fn()} />);

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('renders each menu item as a link with its href', () => {
    render(<MobileMenu menuItems={menuItems} onNavigate={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Tours' })).toHaveAttribute('href', '/tours');
  });

  it('applies a per-item color when provided', () => {
    render(<MobileMenu menuItems={menuItems} onNavigate={vi.fn()} />);

    const link = screen.getByRole('link', { name: 'Tours' });
    expect(link).toHaveClass('text-menu-item-tan-200');
    expect(link).not.toHaveClass('text-zinc-50');
  });

  it('falls back to white when no color is provided', () => {
    render(<MobileMenu menuItems={menuItems} onNavigate={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'About' })).toHaveClass('text-zinc-50');
  });

  it('keeps the white base under a state-scoped color so it shows when idle', () => {
    const scopedItems = [
      {
        name: 'Home',
        href: '/',
        color:
          'aria-[current=page]:text-menu-item-yellow-400 hover:text-menu-item-yellow-400 hover:decoration-menu-item-yellow-400',
      },
    ];
    render(<MobileMenu menuItems={scopedItems} onNavigate={vi.fn()} />);

    const link = screen.getByRole('link', { name: 'Home' });
    expect(link).toHaveClass('text-zinc-50');
    expect(link).toHaveClass('hover:text-menu-item-yellow-400');
  });

  it('marks the active link with aria-current=page', () => {
    render(<MobileMenu menuItems={menuItems} onNavigate={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('does not mark inactive links with aria-current', () => {
    render(<MobileMenu menuItems={menuItems} onNavigate={vi.fn()} />);

    expect(screen.getByRole('link', { name: 'About' })).not.toHaveAttribute('aria-current');
  });

  it('calls onNavigate when a menu link is clicked', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<MobileMenu menuItems={menuItems} onNavigate={onNavigate} />);

    await user.click(screen.getByRole('link', { name: 'Home' }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('wires onNavigate into the auth toolbar', async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(<MobileMenu menuItems={menuItems} onNavigate={onNavigate} />);

    await user.click(screen.getByTestId('auth-toolbar-action'));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('staggers each item via an incremental animation delay', () => {
    render(<MobileMenu menuItems={menuItems} onNavigate={vi.fn()} />);

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveStyle({ animationDelay: '0s' });
    expect(items[1]).toHaveStyle({ animationDelay: '0.1s' });
    expect(items[2]).toHaveStyle({ animationDelay: '0.2s' });
  });

  it('applies the menu-item-stagger class to each item', () => {
    render(<MobileMenu menuItems={menuItems} onNavigate={vi.fn()} />);

    screen.getAllByRole('listitem').forEach((item) => {
      expect(item).toHaveClass('menu-item-stagger');
    });
  });
});
