/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import { FORMATS } from '@/lib/types/domain/shared';

import { ReleaseSummaryCard } from './release-summary-card';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="next-image" data-src={src} data-alt={alt} />
  ),
}));

describe('ReleaseSummaryCard', () => {
  const defaultProps = {
    title: 'Midnight Serenade',
    artistName: 'John Doe',
    coverArt: { src: 'https://cdn.example.com/cover.jpg', alt: 'Midnight Serenade cover art' },
    // Local constructor keeps the formatted date timezone-stable across CI.
    releasedOn: new Date(2024, 0, 2),
    formats: [FORMATS.DIGITAL, FORMATS.VINYL_12_INCH],
  };

  it('should render the title and artist', () => {
    render(<ReleaseSummaryCard {...defaultProps} />);

    expect(screen.getByText('Midnight Serenade')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('should render the formatted release date', () => {
    render(<ReleaseSummaryCard {...defaultProps} />);

    expect(screen.getByText(/Released Jan 2, 2024/)).toBeInTheDocument();
  });

  it('should render the cover image with its source and alt', () => {
    render(<ReleaseSummaryCard {...defaultProps} />);

    const image = screen.getByTestId('next-image');
    expect(image).toHaveAttribute('data-src', defaultProps.coverArt.src);
    expect(image).toHaveAttribute('data-alt', defaultProps.coverArt.alt);
  });

  it('should render a placeholder when coverArt is null', () => {
    render(<ReleaseSummaryCard {...defaultProps} coverArt={null} />);

    expect(screen.queryByTestId('next-image')).not.toBeInTheDocument();
    expect(screen.getByTestId('summary-cover-placeholder')).toHaveTextContent('Midnight Serenade');
  });

  it('should render format tags with underscores rendered as spaces', () => {
    render(<ReleaseSummaryCard {...defaultProps} />);

    expect(screen.getByText('DIGITAL')).toBeInTheDocument();
    expect(screen.getByText('VINYL 12 INCH')).toBeInTheDocument();
  });

  it('should omit the format list when there are no formats', () => {
    const { container } = render(<ReleaseSummaryCard {...defaultProps} formats={[]} />);

    expect(container.querySelector('ul')).toBeNull();
  });

  it('should omit the artist line when artistName is null', () => {
    render(<ReleaseSummaryCard {...defaultProps} artistName={null} />);

    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
  });

  it('should apply a zine border and any passed className', () => {
    const { container } = render(<ReleaseSummaryCard {...defaultProps} className="float-test" />);

    const root = container.firstElementChild;
    expect(root).toHaveClass('border-2', 'border-black', 'shadow-zine-sm', 'float-test');
  });
});
