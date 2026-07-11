/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { ZineHeading } from './zine-heading';

describe('ZineHeading', () => {
  it('renders an h1 by default', () => {
    render(<ZineHeading>Releases</ZineHeading>);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders the heading element for the given level', () => {
    render(<ZineHeading level={2}>Releases</ZineHeading>);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('renders the bare cutout strip classes on the zine-heading span', () => {
    const { container } = render(<ZineHeading>Releases</ZineHeading>);
    const strip = container.querySelector('[data-slot="zine-heading"]');
    expect(strip).toHaveClass('font-fake-four-cutout', 'uppercase', 'px-3', 'py-1');
    // The strip lost its box chrome: no border, tint, ink shadow, or tilt.
    expect(strip).not.toHaveClass(
      'border-2',
      'border-black',
      'bg-[var(--card-accent-soft)]',
      'shadow-zine-ink',
      '-rotate-1'
    );
  });

  it('spans the row on mobile and shrinks to its content from sm up', () => {
    const { container } = render(<ZineHeading>Releases</ZineHeading>);

    expect(container.querySelector('[data-slot="zine-heading"]')).toHaveClass(
      'w-full',
      'sm:w-auto'
    );
  });

  it('neutralizes the fixed level height with h-auto', () => {
    render(<ZineHeading>Releases</ZineHeading>);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveClass('h-auto');
    expect(heading).not.toHaveClass('h-[52px]');
  });

  it('cn-merges a custom className onto the heading element', () => {
    render(<ZineHeading className="mb-0">Releases</ZineHeading>);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveClass('mb-0');
    expect(heading).not.toHaveClass('mb-4');
  });

  it('renders children inside the strip span', () => {
    render(<ZineHeading>Releases</ZineHeading>);
    expect(screen.getByText('Releases')).toHaveAttribute('data-slot', 'zine-heading');
  });

  it('spreads extra props onto the heading element', () => {
    render(<ZineHeading id="page-title">Releases</ZineHeading>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('id', 'page-title');
  });
});
