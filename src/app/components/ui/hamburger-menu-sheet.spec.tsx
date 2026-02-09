import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import HamburgerMenuSheet from './hamburger-menu-sheet';

vi.mock('../auth/auth-toolbar', () => ({
  default: ({ className }: { className?: string }) => (
    <div data-testid="auth-toolbar" className={className}>
      Auth Toolbar
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

  it('renders separator between auth toolbar and social media links', () => {
    render(
      <HamburgerMenuSheet isOpen onOpenChange={mockOnOpenChange} menuItems={defaultMenuItems}>
        <button>Open</button>
      </HamburgerMenuSheet>
    );

    // Sheet content renders in a Radix portal on document.body, not inside container
    const separators = document.querySelectorAll('[data-slot="separator"]');
    expect(separators.length).toBeGreaterThanOrEqual(1);
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
    expect(homeLink).toHaveClass('text-white');
    expect(homeLink).toHaveClass('text-2xl');
    expect(homeLink).toHaveClass('font-light');
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
