/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { ImageHeading } from './image-heading';

// Mock next/image using <span> to avoid the @next/next/no-img-element lint rule,
// surfacing every forwarded prop (including aria-hidden) as data-/attributes.
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    <span
      aria-hidden={props['aria-hidden'] as boolean | undefined}
      className={props.className as string | undefined}
      data-alt={props.alt as string}
      data-height={String(props.height)}
      data-priority={props.priority ? 'true' : 'false'}
      data-src={props.src as string}
      data-testid="next-image"
      data-width={String(props.width)}
    />
  ),
}));

const defaultProps = {
  src: '/media/headings/FEATURED-1920-480.webp',
  alt: 'featured artists',
  imageHeight: 480,
};

describe('ImageHeading', () => {
  it('defaults to an h1', () => {
    render(<ImageHeading {...defaultProps} />);

    expect(screen.getByRole('heading', { level: 1 }).tagName).toBe('H1');
  });

  it('renders the requested heading level', () => {
    render(<ImageHeading {...defaultProps} level={2} />);

    expect(screen.getByRole('heading', { level: 2 }).tagName).toBe('H2');
  });

  it('forwards the alt text to the image', () => {
    render(<ImageHeading {...defaultProps} />);

    expect(screen.getByTestId('next-image')).toHaveAttribute('data-alt', 'featured artists');
  });

  it('does not render a visually hidden text span', () => {
    const { container } = render(<ImageHeading {...defaultProps} />);

    expect(container.querySelector('.sr-only')).toBeNull();
  });

  it('does not hide the image from assistive tech', () => {
    render(<ImageHeading {...defaultProps} />);

    expect(screen.getByTestId('next-image')).not.toHaveAttribute('aria-hidden');
  });

  it('forwards the image source', () => {
    render(<ImageHeading {...defaultProps} />);

    expect(screen.getByTestId('next-image')).toHaveAttribute(
      'data-src',
      '/media/headings/FEATURED-1920-480.webp'
    );
  });

  it('defaults the intrinsic width to 1920', () => {
    render(<ImageHeading {...defaultProps} />);

    expect(screen.getByTestId('next-image')).toHaveAttribute('data-width', '1920');
  });

  it('applies a custom intrinsic width', () => {
    render(<ImageHeading {...defaultProps} imageWidth={800} />);

    expect(screen.getByTestId('next-image')).toHaveAttribute('data-width', '800');
  });

  it('applies the intrinsic height', () => {
    render(<ImageHeading {...defaultProps} />);

    expect(screen.getByTestId('next-image')).toHaveAttribute('data-height', '480');
  });

  it('applies the default heading spacing classes', () => {
    render(<ImageHeading {...defaultProps} />);

    expect(screen.getByRole('heading')).toHaveClass('mt-1', 'mb-1.5', 'h-auto');
  });

  it('forwards className to the heading alongside the defaults', () => {
    render(<ImageHeading {...defaultProps} className="custom-heading" />);

    const heading = screen.getByRole('heading');
    expect(heading).toHaveClass('custom-heading');
    expect(heading).toHaveClass('mt-1', 'mb-1.5', 'h-auto');
  });

  it('forwards imageClassName to the image', () => {
    render(<ImageHeading {...defaultProps} imageClassName="custom-image" />);

    expect(screen.getByTestId('next-image')).toHaveClass('custom-image');
  });

  it('marks the image as a priority LCP candidate when requested', () => {
    render(<ImageHeading {...defaultProps} priority />);

    expect(screen.getByTestId('next-image')).toHaveAttribute('data-priority', 'true');
  });

  it('does not mark the image as priority by default', () => {
    render(<ImageHeading {...defaultProps} />);

    expect(screen.getByTestId('next-image')).toHaveAttribute('data-priority', 'false');
  });

  it('passes additional heading props through', () => {
    render(<ImageHeading {...defaultProps} id="featured-heading" />);

    expect(screen.getByRole('heading')).toHaveAttribute('id', 'featured-heading');
  });
});
