/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HamburgerMenu } from './hamburger-menu';

const mockUseSession = vi.hoisted(() => vi.fn());

vi.mock('@/app/hooks/use-session', () => ({
  useSession: mockUseSession,
}));

vi.mock('../auth/auth-toolbar', () => ({
  AuthToolbar: ({ className }: { className?: string }) => (
    <div data-testid="auth-toolbar" className={className}>
      Auth Toolbar
    </div>
  ),
}));

describe('HamburgerMenu', () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: vi.fn(),
    });
  });
  it('renders', () => {
    render(<HamburgerMenu />);

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('has screen reader text for closed menu', () => {
    render(<HamburgerMenu />);

    expect(screen.getByText('Open menu')).toBeInTheDocument();
  });

  it('renders hamburger patties', () => {
    const { container } = render(<HamburgerMenu />);

    // Three patties for the hamburger icon
    const patties = container.querySelectorAll('span.absolute');
    expect(patties.length).toBeGreaterThanOrEqual(3);
  });

  it('button has transparent background', () => {
    render(<HamburgerMenu />);

    expect(screen.getByRole('button')).toHaveClass('bg-transparent');
  });

  it('lifts the tap area so the lines sit centered in the header bar', () => {
    render(<HamburgerMenu />);

    // -top-1 rises the visible mark 6px from its old top-0.5 seat,
    // equalizing the air above and below the lines within the 58px bar.
    expect(screen.getByRole('button')).toHaveClass('-top-1');
  });

  it('renders bare lines with no border, shadow, or stamp accent', () => {
    render(<HamburgerMenu />);

    // The offset-stamp accent never read as intentional at icon scale, so
    // the tap area carries no chrome at all: a borderless, shadowless
    // button around three stark lines on the black header.
    const button = screen.getByRole('button');
    expect(button).toHaveClass('border-0', 'shadow-none');
    expect(button).not.toHaveClass('border-2', 'border-zinc-50');
    const linesBox = button.querySelector('span.size-5');
    expect(linesBox?.className).not.toMatch(/shadow/);
    expect(linesBox?.className).not.toMatch(/card-accent/);
  });

  it('toggles screen reader text when clicked', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<HamburgerMenu />);

    expect(screen.getByText('Open menu')).toBeInTheDocument();

    await user.click(screen.getByRole('button'));

    expect(screen.getByText('Close menu')).toBeInTheDocument();
  });

  it('has pointer-events-none wrapper with flex layout', () => {
    const { container } = render(<HamburgerMenu />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex');
    expect(wrapper).toHaveClass('justify-end');
    expect(wrapper).toHaveClass('items-center');
    expect(wrapper).toHaveClass('pointer-events-none');
  });

  it('button has pointer-events-auto to remain clickable', () => {
    render(<HamburgerMenu />);

    expect(screen.getByRole('button')).toHaveClass('pointer-events-auto');
  });

  it('renders exactly three hamburger patties', () => {
    const { container } = render(<HamburgerMenu />);

    const patties = container.querySelectorAll('span.absolute');
    expect(patties).toHaveLength(3);
  });

  it('screen reader text toggles back to open after double click', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<HamburgerMenu />);

    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Close menu')).toBeInTheDocument();

    // After the Sheet dialog opens, Radix marks outside content as aria-hidden
    // and the overlay blocks pointer-events. Use fireEvent to bypass the overlay
    // since we're testing state toggle logic, not pointer interaction.
    const triggerButton = screen.getByRole('button', { name: 'Close menu', hidden: true });
    fireEvent.click(triggerButton);
    expect(screen.getByText('Open menu')).toBeInTheDocument();
  });

  it('renders the desktop nav categories as accordion triggers', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<HamburgerMenu />);
    await user.click(screen.getByRole('button'));

    expect(screen.getByRole('button', { name: 'Music' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Label' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('shares the grouped nav projection with the desktop menu', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<HamburgerMenu />);
    await user.click(screen.getByRole('button'));

    // Artists, Videos and Playlists live inside the Music category — same
    // projection the desktop drawers render, one tap deeper on mobile.
    await user.click(screen.getByRole('button', { name: 'Music' }));

    expect(screen.getByRole('link', { name: 'Artists' })).toHaveAttribute('href', '/artists');
    expect(screen.getByRole('link', { name: 'Videos' })).toHaveAttribute('href', '/videos');
    expect(screen.getByRole('link', { name: 'Playlists' })).toHaveAttribute('href', '/playlists');
  });

  it('shows My Collection link when user is authenticated', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: '1', name: 'Test' } },
      status: 'authenticated',
      update: vi.fn(),
    });

    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<HamburgerMenu />);
    await user.click(screen.getByRole('button'));

    expect(screen.getByText('My Collection')).toBeInTheDocument();
  });

  it('does not show My Collection link when user is unauthenticated', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    render(<HamburgerMenu />);
    await user.click(screen.getByRole('button'));

    expect(screen.queryByText('My Collection')).not.toBeInTheDocument();
  });
});
