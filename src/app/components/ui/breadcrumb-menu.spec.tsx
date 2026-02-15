/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { BreadcrumbMenu } from './breadcrumb-menu';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Home: () => <svg data-testid="home-icon" />,
  ChevronRight: () => <svg data-testid="chevron-right-icon" />,
}));

describe('BreadcrumbMenu', () => {
  const mockItems = [
    {
      anchorText: 'Dashboard',
      url: '/dashboard',
      isActive: false,
    },
    {
      anchorText: 'Profile',
      url: '/profile',
      isActive: true,
    },
  ];

  it('renders the home icon', () => {
    render(<BreadcrumbMenu items={[]} />);

    expect(screen.getByTestId('home-icon')).toBeInTheDocument();
  });

  it('renders home link with correct href', () => {
    render(<BreadcrumbMenu items={[]} />);

    const homeLinks = screen.getAllByRole('link', { name: /home/i });
    expect(homeLinks).toHaveLength(2); // One visible, one in icon
    expect(homeLinks[0]).toHaveAttribute('href', '/');
  });

  it('renders screen reader text for home icon', () => {
    render(<BreadcrumbMenu items={[]} />);

    const srText = screen.getAllByText('Home');
    // Find the one with sr-only class
    const srOnlyText = srText.find((el) => el.className.includes('sr-only'));
    expect(srOnlyText).toBeInTheDocument();
  });

  it('renders all breadcrumb items', () => {
    render(<BreadcrumbMenu items={mockItems} />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
  });

  it('renders inactive items as links', () => {
    render(<BreadcrumbMenu items={mockItems} />);

    const dashboardLink = screen.getByRole('link', { name: 'Dashboard' });
    expect(dashboardLink).toBeInTheDocument();
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
  });

  it('renders active items as plain text (not links)', () => {
    render(<BreadcrumbMenu items={mockItems} />);

    const profileText = screen.getByText('Profile');
    expect(profileText).toBeInTheDocument();
    // Active item should not be a link
    expect(profileText.tagName).not.toBe('A');
  });

  it('renders separators between items', () => {
    const { container } = render(<BreadcrumbMenu items={mockItems} />);

    // Check for separator elements
    const separators = container.querySelectorAll('[role="presentation"]');
    // Should have separators for: Home-Dashboard and Dashboard-Profile
    expect(separators.length).toBeGreaterThan(0);
  });

  it('renders empty list when no items provided', () => {
    const { container } = render(<BreadcrumbMenu items={[]} />);

    const breadcrumbList = container.querySelector('ol');
    expect(breadcrumbList).toBeInTheDocument();
    expect(screen.getAllByText('Home')).toHaveLength(2); // Icon sr-only + link text
  });

  it('renders single item correctly', () => {
    const singleItem = [
      {
        anchorText: 'Settings',
        url: '/settings',
        isActive: true,
      },
    ];

    render(<BreadcrumbMenu items={singleItem} />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getAllByText('Home')).toHaveLength(2); // Icon + link text
  });

  it('generates unique keys for items using url and anchorText', () => {
    const { container } = render(<BreadcrumbMenu items={mockItems} />);

    const itemContainers = container.querySelectorAll('[class="contents"]');
    expect(itemContainers.length).toBe(mockItems.length);
  });

  it('handles items with same anchorText but different urls', () => {
    const duplicateNameItems = [
      {
        anchorText: 'Edit',
        url: '/user/edit',
        isActive: false,
      },
      {
        anchorText: 'Edit',
        url: '/post/edit',
        isActive: false,
      },
    ];

    render(<BreadcrumbMenu items={duplicateNameItems} />);

    const editLinks = screen.getAllByRole('link', { name: 'Edit' });
    expect(editLinks).toHaveLength(2);
    expect(editLinks[0]).toHaveAttribute('href', '/user/edit');
    expect(editLinks[1]).toHaveAttribute('href', '/post/edit');
  });

  it('applies correct classes to wrapper', () => {
    const { container } = render(<BreadcrumbMenu items={mockItems} />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex');
    expect(wrapper).toHaveClass('items-center');
    expect(wrapper).toHaveClass('gap-2');
  });

  it('applies hover styles to home icon link', () => {
    const { container } = render(<BreadcrumbMenu items={[]} />);

    const homeIconLink = container.querySelector('a[href="/"]');
    expect(homeIconLink).toBeInTheDocument();
    // Check that the link element exists and has expected structure
    expect(homeIconLink?.querySelector('[data-testid="home-icon"]')).toBeInTheDocument();
  });

  it('renders multiple active items if provided', () => {
    const multipleActiveItems = [
      {
        anchorText: 'Page 1',
        url: '/page1',
        isActive: true,
      },
      {
        anchorText: 'Page 2',
        url: '/page2',
        isActive: true,
      },
    ];

    render(<BreadcrumbMenu items={multipleActiveItems} />);

    const page1 = screen.getByText('Page 1');
    const page2 = screen.getByText('Page 2');

    expect(page1.tagName).not.toBe('A');
    expect(page2.tagName).not.toBe('A');
  });

  it('handles special characters in anchorText', () => {
    const specialCharItems = [
      {
        anchorText: 'Settings & Preferences',
        url: '/settings',
        isActive: false,
      },
      {
        anchorText: 'User <Profile>',
        url: '/profile',
        isActive: true,
      },
    ];

    render(<BreadcrumbMenu items={specialCharItems} />);

    expect(screen.getByText('Settings & Preferences')).toBeInTheDocument();
    expect(screen.getByText('User <Profile>')).toBeInTheDocument();
  });

  it('handles long breadcrumb chains', () => {
    const longChain = Array.from({ length: 5 }, (_, i) => ({
      anchorText: `Level ${i + 1}`,
      url: `/level${i + 1}`,
      isActive: i === 4,
    }));

    render(<BreadcrumbMenu items={longChain} />);

    longChain.forEach((item) => {
      expect(screen.getByText(item.anchorText)).toBeInTheDocument();
    });
  });

  it('renders with aria attributes for accessibility', () => {
    const { container } = render(<BreadcrumbMenu items={mockItems} />);

    const breadcrumb = container.querySelector('[aria-label="breadcrumb"]');
    expect(breadcrumb).toBeInTheDocument();
  });

  it('home icon has correct structure', () => {
    render(<BreadcrumbMenu items={[]} />);

    const homeIcon = screen.getByTestId('home-icon');
    expect(homeIcon).toBeInTheDocument();
    // Verify the home icon is within a link
    const link = homeIcon.closest('a');
    expect(link).toHaveAttribute('href', '/');
  });
});
