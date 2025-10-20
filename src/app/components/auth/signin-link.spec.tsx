import React from 'react';

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import SignInLink from './signin-link';

// Mock lucide-react
vi.mock('lucide-react', () => ({
  LogInIcon: ({ size }: { size?: number }) => (
    <div data-testid="login-icon" data-size={size}>
      LogInIcon
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

describe('SignInLink', () => {
  it('renders the sign in link', () => {
    render(<SignInLink />);

    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/signin');
  });

  it('displays the correct text', () => {
    render(<SignInLink />);

    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('renders the login icon with correct size', () => {
    render(<SignInLink />);

    const icon = screen.getByTestId('login-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('data-size', '16');
  });

  it('applies the correct CSS classes', () => {
    render(<SignInLink />);

    const link = screen.getByRole('link');
    expect(link).toHaveClass('flex', 'items-center', 'gap-2', 'text-sm');
  });
});
