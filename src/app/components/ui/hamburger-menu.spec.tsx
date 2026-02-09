import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import HamburgerMenu from './hamburger-menu';

vi.mock('../auth/auth-toolbar', () => ({
  default: ({ className }: { className?: string }) => (
    <div data-testid="auth-toolbar" className={className}>
      Auth Toolbar
    </div>
  ),
}));

describe('HamburgerMenu', () => {
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

  it('toggles screen reader text when clicked', async () => {
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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
});
