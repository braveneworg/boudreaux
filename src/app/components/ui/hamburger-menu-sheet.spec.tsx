/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { NavMenuEntry } from '@/hooks/use-nav-menu-groups';

import { HamburgerMenuSheet } from './hamburger-menu-sheet';

vi.mock('../auth/auth-toolbar', () => ({
  AuthToolbar: ({ className, onNavigate }: { className?: string; onNavigate?: () => void }) => (
    <div data-testid="auth-toolbar" className={className}>
      <button data-testid="auth-toolbar-action" onClick={onNavigate}>
        Auth Toolbar
      </button>
    </div>
  ),
}));

const linkEntry = (name: string, href: string, color: string): NavMenuEntry => ({
  kind: 'link',
  item: { name, href, color },
});

describe('HamburgerMenuSheet', () => {
  // The global next/navigation mock resolves usePathname() to '/'.
  const defaultEntries: NavMenuEntry[] = [
    linkEntry('Home', '/', 'aria-[current=page]:text-menu-item-yellow-400'),
    linkEntry('About', '/about', 'aria-[current=page]:text-menu-item-pink-400'),
    linkEntry('Contact', '/contact', 'aria-[current=page]:text-menu-item-orange-300'),
  ];
  const groupedEntries: NavMenuEntry[] = [
    linkEntry('Home', '/', 'aria-[current=page]:text-menu-item-yellow-400'),
    {
      kind: 'group',
      group: {
        label: 'Music',
        items: [
          {
            name: 'Releases',
            href: '/releases',
            color: 'aria-[current=page]:text-menu-item-cyan-400',
          },
        ],
      },
    },
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
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('renders menu items', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('About')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button data-testid="trigger">Open Menu</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByTestId('trigger')).toBeInTheDocument();
  });

  it('menu items have correct href', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
  });

  it('calls onOpenChange when menu item is clicked', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    await user.click(screen.getByRole('link', { name: 'Home' }));

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders a category group as a collapsed trigger inside the sheet', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={groupedEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Releases' })).not.toBeInTheDocument();
  });

  it('closes the sheet when an expanded category link is clicked', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={groupedEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    await user.click(screen.getByRole('button', { name: 'Music' }));
    await user.click(screen.getByRole('link', { name: 'Releases' }));

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('has accessible navigation structure', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByRole('list')).toBeInTheDocument();
    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(3);
  });

  it('renders social media links', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    // SocialMediaIconLinks renders multiple links
    const socialLinks = screen.getAllByRole('link');
    expect(socialLinks.length).toBeGreaterThan(3); // More than just menu items
  });

  it('has sr-only title', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByText('Navigation Menu')).toHaveClass('sr-only');
  });

  it('renders auth toolbar with text-zinc-50 class', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    const authToolbar = screen.getByTestId('auth-toolbar');
    expect(authToolbar).toBeInTheDocument();
    expect(authToolbar).toHaveClass('text-zinc-50');
  });

  it('renders social media links before auth toolbar', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
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

  it('renders empty menu list when no entries provided', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={[]}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('menu links have correct styling classes', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    const homeLink = screen.getByRole('link', { name: 'Home' });
    expect(homeLink).toHaveClass('text-zinc-50');
    expect(homeLink).toHaveClass('text-xl');
  });

  it('lets an unscoped per-item color override the white base', () => {
    render(
      <HamburgerMenuSheet
        isOpen
        onOpenChange={mockOnOpenChange}
        entries={[linkEntry('Tours', '/tours', 'text-menu-item-tan-200')]}
      >
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    const link = screen.getByRole('link', { name: 'Tours' });
    expect(link).toHaveClass('text-menu-item-tan-200');
    expect(link).not.toHaveClass('text-zinc-50');
  });

  it('marks the active link with aria-current=page', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('does not mark inactive links with aria-current', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByRole('link', { name: 'About' })).not.toHaveAttribute('aria-current');
  });

  it('underlines the active link', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByRole('link', { name: 'Home' })).toHaveClass('aria-[current=page]:underline');
  });

  it('calls onOpenChange(false) when auth toolbar onNavigate is triggered', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    await user.click(screen.getByTestId('auth-toolbar-action'));

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders menu items as keyboard-focusable anchors with an href', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    // An anchor with an href is inherently focusable — no explicit tabIndex
    // needed — so assert the element is a real link rather than a manual override.
    const homeLink = screen.getByRole('link', { name: 'Home' });
    expect(homeLink.tagName).toBe('A');
    expect(homeLink).toHaveAttribute('href', '/');
    expect(homeLink).not.toHaveAttribute('tabindex');
  });

  it('renders the sr-only sheet description', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    const description = screen.getByText('Site navigation links and account actions.');
    expect(description).toBeInTheDocument();
    expect(description).toHaveClass('sr-only');
  });

  it('sets an accessible aria-label on the navigation menu dialog', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Navigation menu');
  });

  it('applies the menu-item-stagger class to each menu list item', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    const items = screen.getAllByRole('listitem');
    items.forEach((item) => {
      expect(item).toHaveClass('menu-item-stagger');
    });
  });

  it('starts the first menu item with no animation delay', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    expect(screen.getAllByRole('listitem')[0]).toHaveStyle({ animationDelay: '0s' });
  });

  it('staggers each subsequent menu item by index via animation delay', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    const items = screen.getAllByRole('listitem');
    expect(items[1]).toHaveStyle({ animationDelay: '0.1s' });
    expect(items[2]).toHaveStyle({ animationDelay: '0.2s' });
  });

  it('applies focus-visible styling to menu links', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} entries={defaultEntries}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    const homeLink = screen.getByRole('link', { name: 'Home' });
    expect(homeLink).toHaveClass('focus:outline-none');
    expect(homeLink).toHaveClass('focus-visible:ring-2');
    expect(homeLink).toHaveClass('focus-visible:ring-white');
  });
});
