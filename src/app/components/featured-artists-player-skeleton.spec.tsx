/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { FeaturedArtistsPlayerSkeleton } from './featured-artists-player-skeleton';

describe('FeaturedArtistsPlayerSkeleton', () => {
  it('is hidden from assistive tech', () => {
    render(<FeaturedArtistsPlayerSkeleton />);

    expect(screen.getByTestId('featured-artists-player-skeleton')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('reserves the carousel row and link-row heights', () => {
    const { container } = render(<FeaturedArtistsPlayerSkeleton />);

    expect(container.querySelector('.min-h-19')).not.toBeNull();
    expect(container.querySelector('.min-h-10.flex-col')).not.toBeNull();
  });

  it('reserves the square cover-art footprint at the player width', () => {
    const { container } = render(<FeaturedArtistsPlayerSkeleton />);

    const cover = container.querySelector('.aspect-square');
    expect(cover).not.toBeNull();
    expect(cover).toHaveClass('max-w-xl', 'w-full');
  });

  it('reserves the controls and ticker rows beneath the cover', () => {
    const { container } = render(<FeaturedArtistsPlayerSkeleton />);

    expect(container.querySelector('.min-h-16')).not.toBeNull();
    expect(container.querySelector('.mb-2.min-h-10')).not.toBeNull();
  });
});
