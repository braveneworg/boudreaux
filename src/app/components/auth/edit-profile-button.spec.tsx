import React from 'react';

import { render, screen } from '@testing-library/react';

import EditProfileButton from './edit-profile-button';

// Mock lucide-react
vi.mock('lucide-react', () => ({
  UserIcon: ({ size }: { size?: number }) => (
    <div data-testid="user-icon" data-size={size}>
      UserIcon
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

// Mock the useIsMobile hook
const mockUseIsMobile = vi.fn();
vi.mock('@/app/hooks/use-mobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

describe('EditProfileButton', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUseIsMobile.mockReturnValue(false); // Default to desktop
  });

  it('renders the edit profile link', () => {
    render(<EditProfileButton />);

    const link = screen.getByRole('link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/profile');
  });

  it('displays the correct text', () => {
    render(<EditProfileButton />);

    expect(screen.getByText('Edit Profile')).toBeInTheDocument();
  });

  it('renders the user icon', () => {
    render(<EditProfileButton />);

    const icon = screen.getByTestId('user-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('data-size', '16');
  });

  it('applies the correct CSS classes', () => {
    render(<EditProfileButton />);

    const link = screen.getByRole('link');
    expect(link).toHaveClass('flex', 'items-center', 'gap-2', 'text-sm', 'underline-offset-4');
  });

  it('renders null on mobile devices', () => {
    mockUseIsMobile.mockReturnValue(true);

    const { container } = render(<EditProfileButton />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders link on desktop devices', () => {
    mockUseIsMobile.mockReturnValue(false);

    render(<EditProfileButton />);

    expect(screen.getByRole('link')).toBeInTheDocument();
  });
});
