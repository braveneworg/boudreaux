/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, fireEvent } from '@testing-library/react';

import { SignOutButton } from './sign-out-button';

const mockSignOut = vi.fn();
vi.mock('next-auth/react', () => ({
  signOut: (options?: { redirect?: boolean; callbackUrl?: string }) => mockSignOut(options),
}));

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('lucide-react', () => ({
  LogOutIcon: () => <div data-testid="logout-icon">LogOutIcon</div>,
}));

vi.mock('@/app/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    variant,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    className?: string;
  }) => (
    <button onClick={onClick} data-variant={variant} className={className}>
      {children}
    </button>
  ),
}));

describe('SignOutButton', () => {
  beforeEach(() => {
    mockSignOut.mockReset();
    mockPush.mockReset();
  });

  it('renders sign out button with icon and text', () => {
    render(<SignOutButton />);

    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    expect(screen.getByTestId('logout-icon')).toBeInTheDocument();
  });

  it('applies link:narrow variant', () => {
    render(<SignOutButton />);

    const button = screen.getByRole('button', { name: /sign out/i });
    expect(button).toHaveAttribute('data-variant', 'link:narrow');
  });

  it('calls signOut with redirect false and navigates to returned URL on click', async () => {
    mockSignOut.mockResolvedValue({ url: '/signed-out' });
    render(<SignOutButton />);

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await vi.waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledWith({ redirect: false, callbackUrl: '/' });
      expect(mockPush).toHaveBeenCalledWith('/signed-out');
    });
  });

  it('calls onNavigate before signing out', async () => {
    const onNavigate = vi.fn();
    mockSignOut.mockResolvedValue({ url: '/' });
    render(<SignOutButton onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(onNavigate).toHaveBeenCalledOnce();

    await vi.waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  it('does not call onNavigate when not provided', async () => {
    mockSignOut.mockResolvedValue({ url: '/' });
    render(<SignOutButton />);

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await vi.waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  it('applies styling classes', () => {
    render(<SignOutButton />);

    const button = screen.getByRole('button', { name: /sign out/i });
    expect(button).toHaveClass('text-zinc-50');
    expect(button).toHaveClass('text-xl');
  });
});
