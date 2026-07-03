/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import NotFoundPage from './not-found';

// Mock next/link (forwards className so styling assertions see it)
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className} data-testid="not-found-link">
      {children}
    </a>
  ),
}));

describe('NotFoundPage', () => {
  it('should render the "Release not found" heading as an image', () => {
    render(<NotFoundPage />);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    const headingImage = screen.getByRole('img', { name: /release not found/i });
    expect(headingImage).toHaveAttribute('alt', 'release not found');
  });

  it('should render a link back to /releases', () => {
    render(<NotFoundPage />);

    const link = screen.getByTestId('not-found-link');
    expect(link).toHaveAttribute('href', '/releases');
  });

  it('should render a descriptive message', () => {
    render(<NotFoundPage />);

    expect(screen.getByText(/could not find the requested release/i)).toBeInTheDocument();
  });

  it('should apply the denim accent to the wrapper', () => {
    const { container } = render(<NotFoundPage />);

    expect(container.firstChild).toHaveClass('zine-accent-denim');
  });

  it('should style the back-link as a stamp', () => {
    render(<NotFoundPage />);

    const link = screen.getByTestId('not-found-link');
    expect(link).toHaveClass('border-2', 'border-black', 'shadow-zine-ink');
    expect(link).not.toHaveClass('rounded-md');
  });
});
