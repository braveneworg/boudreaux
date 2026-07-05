/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ReleaseCoverModal } from './release-cover-modal';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="next-image" data-src={src} data-alt={alt} />
  ),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href} data-testid="mock-link">
      {children}
    </a>
  ),
}));

describe('ReleaseCoverModal', () => {
  const defaultProps = {
    id: 'release-1',
    title: 'Midnight Serenade',
    artistName: 'John Doe',
    coverArt: {
      src: 'https://cdn.example.com/cover.jpg',
      alt: 'Midnight Serenade cover art',
    },
    // Local constructor keeps the formatted date timezone-stable across CI.
    releasedOn: new Date(2024, 0, 2),
  };

  it('should render the cover art as a zoom trigger button', () => {
    render(<ReleaseCoverModal {...defaultProps} />);

    const trigger = screen.getByRole('button', { name: /expand cover art for midnight serenade/i });
    const image = screen.getByTestId('next-image');
    expect(trigger).toBeInTheDocument();
    expect(image).toHaveAttribute('data-src', defaultProps.coverArt.src);
    expect(image).toHaveAttribute('data-alt', defaultProps.coverArt.alt);
  });

  it('should frame the cover trigger as a zoomable bordered square', () => {
    render(<ReleaseCoverModal {...defaultProps} />);

    const trigger = screen.getByRole('button', { name: /expand cover art for midnight serenade/i });
    expect(trigger).toHaveClass('cursor-zoom-in', 'border-2', 'border-black', 'aspect-square');
    expect(trigger).not.toHaveClass('rounded-md');
  });

  it('should render a non-interactive placeholder when coverArt is null', () => {
    render(<ReleaseCoverModal {...defaultProps} coverArt={null} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const placeholder = screen.getByTestId('cover-art-placeholder');
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toHaveTextContent('Midnight Serenade');
    expect(placeholder).toHaveTextContent('John Doe');
  });

  it('should open a dialog with the enlarged cover when the trigger is clicked', async () => {
    render(<ReleaseCoverModal {...defaultProps} />);

    await userEvent.click(
      screen.getByRole('button', { name: /expand cover art for midnight serenade/i })
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // Both the trigger cover and the enlarged dialog cover are now mounted.
    expect(screen.getAllByTestId('next-image')).toHaveLength(2);
  });

  it('should show the title, artist, and formatted release date in the dialog', async () => {
    render(<ReleaseCoverModal {...defaultProps} />);

    await userEvent.click(
      screen.getByRole('button', { name: /expand cover art for midnight serenade/i })
    );

    expect(screen.getByRole('heading', { name: 'Midnight Serenade' })).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText(/Jan 2, 2024/)).toBeInTheDocument();
  });

  it('should link to the release detail page from the dialog', async () => {
    render(<ReleaseCoverModal {...defaultProps} />);

    await userEvent.click(
      screen.getByRole('button', { name: /expand cover art for midnight serenade/i })
    );

    const detailLink = screen.getByRole('link', { name: /view release details/i });
    expect(detailLink).toHaveAttribute('href', '/releases/release-1');
  });
});
