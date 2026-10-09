/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DisplayImageCollage } from './display-image-collage';

import type { GalleryImage } from './display-image-gallery';

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    priority,
    unoptimized,
  }: {
    src: string;
    alt: string;
    priority?: boolean;
    unoptimized?: boolean;
  }) => (
    <span
      data-testid="next-image"
      data-src={src}
      data-alt={alt}
      data-priority={String(!!priority)}
      data-unoptimized={String(!!unoptimized)}
    />
  ),
}));

vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

const image = (n: number): GalleryImage => ({
  id: `img-${n}`,
  url: `https://cdn.example/${n}.jpg`,
  thumbnailUrl: `https://cdn.example/${n}-thumb.jpg`,
  alt: `Photo ${n}`,
  title: null,
  attribution: null,
  license: null,
  sourceUrl: null,
  width: null,
  height: null,
});

const images = (count: number): GalleryImage[] =>
  Array.from({ length: count }, (_, n) => image(n + 1));

const renderCollage = (count = 9) => {
  render(<DisplayImageCollage images={images(count)} displayName="Test Artist" />);
  return userEvent.setup({ delay: null });
};

const collage = () => screen.getByRole('list', { name: 'Test Artist photos' });

describe('DisplayImageCollage', () => {
  it('is the page’s display-image list with a tile per image, up to seven', () => {
    renderCollage(9);

    expect(collage()).toHaveAttribute('data-slot', 'artist-display-images');
    const tiles = within(collage()).getAllByRole('button', { name: /^Expand image: / });
    expect(tiles.map((tile) => tile.getAttribute('aria-label'))).toEqual(
      Array.from({ length: 7 }, (_, n) => `Expand image: Photo ${n + 1}`)
    );
  });

  it('draws nothing over the frames: no numbers, no ring', () => {
    renderCollage(3);

    expect(collage()).toHaveTextContent('');
    const lead = screen.getByRole('button', { name: 'Expand image: Photo 1' });
    expect(lead.querySelectorAll('span[aria-hidden]')).toHaveLength(0);
  });

  it('says how many more images the last tile hides', () => {
    renderCollage(9);

    const last = screen.getByRole('button', { name: 'Expand image: Photo 7' });
    expect(last).toHaveTextContent('+2');
    expect(within(last).getByText('more images')).toHaveClass('sr-only');
  });

  it('shows no more-count when every image has a tile', () => {
    renderCollage(7);

    expect(collage()).not.toHaveTextContent('+');
  });

  it('loads the lead image first', () => {
    renderCollage(3);

    const [lead, second] = screen.getAllByTestId('next-image');
    expect(lead).toHaveAttribute('data-priority', 'true');
    expect(second).toHaveAttribute('data-priority', 'false');
  });

  it('opens the gallery at the tile that was clicked', async () => {
    const user = renderCollage(9);

    await user.click(screen.getByRole('button', { name: 'Expand image: Photo 3' }));

    const dialog = screen.getByRole('dialog', { name: 'Test Artist' });
    expect(within(dialog).getByText('3 of 9')).toBeInTheDocument();
  });

  it('opens the gallery at the seventh image from the more tile', async () => {
    const user = renderCollage(9);

    await user.click(screen.getByRole('button', { name: 'Expand image: Photo 7' }));

    expect(within(screen.getByRole('dialog')).getByText('7 of 9')).toBeInTheDocument();
  });

  it('steps through every image, past the seven tiles', async () => {
    const user = renderCollage(9);
    await user.click(screen.getByRole('button', { name: 'Expand image: Photo 7' }));

    await user.click(screen.getByRole('button', { name: 'Next image' }));
    await user.click(screen.getByRole('button', { name: 'Next image' }));

    expect(within(screen.getByRole('dialog')).getByText('9 of 9')).toBeInTheDocument();
  });

  it('returns focus to the tile that opened the gallery when it closes', async () => {
    const user = renderCollage(9);
    const tile = screen.getByRole('button', { name: 'Expand image: Photo 3' });
    await user.click(tile);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(tile).toHaveFocus());
  });

  it('shows an inert placeholder when there is nothing to show', () => {
    render(<DisplayImageCollage images={[]} displayName="Test Artist" />);

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByTestId('display-image-placeholder')).toHaveAttribute('aria-hidden', 'true');
  });

  it('serves a single-variant bio thumbnail unoptimized, so the loader never ignores a width', () => {
    const thumb = 'https://cdn.fakefourrecords.com/media/artists/a1/bio/thumbs/1-3c44e452.webp';
    render(
      <DisplayImageCollage
        images={[{ ...image(1), thumbnailUrl: thumb }]}
        displayName="Test Artist"
      />
    );

    const tile = screen.getByTestId('next-image');
    expect(tile).toHaveAttribute('data-src', thumb);
    expect(tile).toHaveAttribute('data-unoptimized', 'true');
  });

  it('leaves a variant-backed CDN image to the loader', () => {
    const full = 'https://cdn.fakefourrecords.com/media/artists/a1/bio/photo.jpg';
    render(
      <DisplayImageCollage
        images={[{ ...image(1), url: full, thumbnailUrl: null }]}
        displayName="Test Artist"
      />
    );

    const tile = screen.getByTestId('next-image');
    expect(tile).toHaveAttribute('data-src', full);
    expect(tile).toHaveAttribute('data-unoptimized', 'false');
  });
});
