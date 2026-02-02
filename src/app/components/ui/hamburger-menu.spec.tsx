import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import HamburgerMenu from './hamburger-menu';

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
});
