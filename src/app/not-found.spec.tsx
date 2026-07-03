/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import NotFound from './not-found';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('NotFound', () => {
  it('renders the message on a denim zine panel', () => {
    const { container } = render(<NotFound />);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveClass('zine-accent-denim');
  });

  it('renders the not-found heading image', () => {
    render(<NotFound />);

    const headingImage = screen.getByRole('img', { name: 'page not found' });
    expect(headingImage).toHaveAttribute('alt', 'page not found');
  });

  it('renders the torn-off-the-wall copy', () => {
    render(<NotFound />);

    expect(screen.getByText(/torn off the wall/i)).toBeInTheDocument();
  });

  it('links back home', () => {
    render(<NotFound />);

    expect(screen.getByRole('link', { name: 'Back home' })).toHaveAttribute('href', '/');
  });
});
