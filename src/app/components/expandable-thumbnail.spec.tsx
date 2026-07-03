/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ExpandableThumbnail } from './expandable-thumbnail';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="next-image" data-src={src} data-alt={alt} />
  ),
}));

describe('ExpandableThumbnail', () => {
  it('renders an expand trigger labelled with the alt text', () => {
    render(<ExpandableThumbnail src="https://x/a.jpg" alt="Artist portrait" />);

    expect(
      screen.getByRole('button', { name: 'Expand image: Artist portrait' })
    ).toBeInTheDocument();
  });

  it('frames the thumbnail trigger with a square black border', () => {
    render(<ExpandableThumbnail src="https://x/a.jpg" alt="Artist portrait" />);

    const trigger = screen.getByRole('button', { name: 'Expand image: Artist portrait' });
    expect(trigger).toHaveClass('border-2', 'border-black');
    expect(trigger).not.toHaveClass('rounded-lg');
  });

  it('uses the thumbnail source for the collapsed image when provided', () => {
    render(
      <ExpandableThumbnail
        src="https://x/full.jpg"
        thumbnailSrc="https://x/thumb.jpg"
        alt="portrait"
      />
    );

    expect(screen.getByTestId('next-image')).toHaveAttribute('data-src', 'https://x/thumb.jpg');
  });

  it('shows attribution, license, and a nofollow source link when expanded', async () => {
    render(
      <ExpandableThumbnail
        src="https://x/a.jpg"
        alt="portrait"
        attribution="Jane Photog"
        license="CC BY-SA 4.0"
        sourceUrl="https://commons.wikimedia.org/wiki/File:a.jpg"
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /expand image/i }));

    expect(screen.getByText('Jane Photog')).toBeInTheDocument();
    expect(screen.getByText(/CC BY-SA 4\.0/)).toBeInTheDocument();
    const sourceLink = screen.getByRole('link', { name: 'source' });
    expect(sourceLink).toHaveAttribute('rel', 'nofollow noopener noreferrer');
    expect(sourceLink).toHaveAttribute('target', '_blank');
  });
});
