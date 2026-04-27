/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import HamburgerMenuSheet from './hamburger-menu-sheet';

vi.mock('../auth/auth-toolbar', () => ({
  default: ({ className, onNavigate }: { className?: string; onNavigate?: () => void }) => (
    <div data-testid="auth-toolbar" className={className}>
      <button data-testid="auth-toolbar-action" onClick={onNavigate}>
        Auth Toolbar
      </button>
    </div>
  ),
}));

describe('HamburgerMenuSheet', () => {
  const defaultMenuItems = [
    { name: 'Home', href: '/' },
    { name: 'About', href: '/about' },
    { name: 'Contact', href: '/contact' },
  ];
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    mockOnOpenChange.mockClear();
    // Prevent jsdom "Not implemented: navigation" errors from anchor clicks
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'A' || target.closest('a')) {
        e.preventDefault();
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  });

  it('renders when open', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} menuItems={defaultMenuItems}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('renders menu items', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} menuItems={defaultMenuItems}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} menuItems={defaultMenuItems}>
        <button data-testid="trigger">Open Menu</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByTestId('trigger')).toBeInTheDocument();
  });

  it('menu items have correct href', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} menuItems={defaultMenuItems}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
  });

  it('calls onOpenChange when menu item is clicked', async () => {
    const user = userEvent.setup();
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} menuItems={defaultMenuItems}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    await user.click(screen.getByRole('link', { name: 'Home' }));

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('has accessible navigation structure', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} menuItems={defaultMenuItems}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByRole('list')).toBeInTheDocument();
    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(3);
  });

  it('renders social media links', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} menuItems={defaultMenuItems}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    // SocialMediaIconLinks renders multiple links
    const socialLinks = screen.getAllByRole('link');
    expect(socialLinks.length).toBeGreaterThan(3); // More than just menu items
  });

  it('has sr-only title', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} menuItems={defaultMenuItems}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByText('Navigation Menu')).toHaveClass('sr-only');
  });

  it('renders auth toolbar with text-zinc-50 class', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} menuItems={defaultMenuItems}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    const authToolbar = screen.getByTestId('auth-toolbar');
    expect(authToolbar).toBeInTheDocument();
    expect(authToolbar).toHaveClass('text-zinc-50');
  });

  it('renders social media links before auth toolbar', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} menuItems={defaultMenuItems}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    const socialIcon = nav.querySelector('[data-testid="facebook-icon"]');
    const authToolbar = nav.querySelector('[data-testid="auth-toolbar"]');
    expect(socialIcon).toBeInTheDocument();
    expect(authToolbar).toBeInTheDocument();

    // Social icons should appear before auth toolbar in DOM order
    const allElements = Array.from(nav.querySelectorAll('[data-testid]'));
    const socialIndex = allElements.findIndex(
      (el) => el.getAttribute('data-testid') === 'facebook-icon'
    );
    const authIndex = allElements.findIndex(
      (el) => el.getAttribute('data-testid') === 'auth-toolbar'
    );
    expect(socialIndex).toBeLessThan(authIndex);
  });

  it('renders empty menu list when no items provided', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} menuItems={[]}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('menu links have correct styling classes', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} menuItems={defaultMenuItems}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    const homeLink = screen.getByRole('link', { name: 'Home' });
    expect(homeLink).toHaveClass('text-zinc-50');
    expect(homeLink).toHaveClass('text-xl');
  });

  it('calls onOpenChange(false) when auth toolbar onNavigate is triggered', async () => {
    const user = userEvent.setup();
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} menuItems={defaultMenuItems}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    await user.click(screen.getByTestId('auth-toolbar-action'));

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('menu links have tabIndex 0 for keyboard accessibility', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} menuItems={defaultMenuItems}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    const homeLink = screen.getByRole('link', { name: 'Home' });
    expect(homeLink).toHaveAttribute('tabindex', '0');
  });
});
