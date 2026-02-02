import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import HamburgerMenuSheet from './hamburger-menu-sheet';

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
});
