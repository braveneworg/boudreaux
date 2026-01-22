import React from 'react';

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import UsernameLink from './username-link';

vi.mock('server-only', () => ({}));

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

describe('UsernameLink', () => {
  it('renders the username link', () => {
    render(<UsernameLink username="testuser" />);

    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
  });

  it('links to the correct profile page', () => {
    render(<UsernameLink username="johndoe" />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/profile/johndoe');
  });

  it('displays username with @ symbol', () => {
    render(<UsernameLink username="testuser" />);

    expect(screen.getByText('@testuser')).toBeInTheDocument();
  });

  it('handles usernames with special characters', () => {
    render(<UsernameLink username="user_123" />);

    expect(screen.getByText('@user_123')).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/profile/user_123');
  });

  it('applies the correct CSS classes', () => {
    render(<UsernameLink username="testuser" />);

    const link = screen.getByRole('link');
    expect(link).toHaveClass('text-sm', 'text-muted-foreground', 'hover:text-foreground');
  });

  it('handles empty username gracefully', () => {
    render(<UsernameLink username="" />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/profile/');
    expect(screen.getByText('@')).toBeInTheDocument();
  });

  it('handles different username formats', () => {
    const usernames = ['alice', 'bob123', 'user_name', 'user-name'];

    usernames.forEach((username) => {
      const { unmount } = render(<UsernameLink username={username} />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', `/profile/${username}`);
      expect(screen.getByText(`@${username}`)).toBeInTheDocument();

      unmount();
    });
  });
});
