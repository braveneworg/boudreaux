import { render, screen } from '@testing-library/react';

import SignUpLink from './signup-link';

// Mock lucide-react
vi.mock('lucide-react', () => ({
  UserPlus: ({ size }: { size?: number }) => (
    <div data-testid="user-plus-icon" data-size={size}>
      UserPlus
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

describe('SignUpLink', () => {
  it('renders the sign up link', () => {
    render(<SignUpLink />);

    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/signup');
  });

  it('displays the correct text', () => {
    render(<SignUpLink />);

    expect(screen.getByText('Sign Up')).toBeInTheDocument();
  });

  it('renders the user plus icon with correct size', () => {
    render(<SignUpLink />);

    const icon = screen.getByTestId('user-plus-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('data-size', '16');
  });

  it('applies the correct CSS classes', () => {
    render(<SignUpLink />);

    const link = screen.getByRole('link');
    expect(link).toHaveClass(
      'flex',
      'text-zinc-50',
      'underline',
      'items-center',
      'gap-2',
      'text-sm'
    );
  });
});
