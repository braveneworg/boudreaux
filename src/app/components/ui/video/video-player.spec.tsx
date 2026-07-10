/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { VideoPlayer } from './video-player';

// Render next/image as a plain <img> so boolean layout props (fill/unoptimized)
// do not warn and the poster src is asserted directly.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => createElement('img', { src, alt }),
}));

// The lazily-loaded surface is the ONLY place video.js is reachable. Mocking it
// to a sentinel proves activation without pulling video.js into the facade's
// module graph — the facade file itself must never import video.js.
vi.mock('./lazy-video-surface', () => ({
  LazyVideoSurface: ({ title }: { title: string }) =>
    createElement('div', { 'data-testid': 'video-surface' }, `surface:${title}`),
}));

describe('VideoPlayer', () => {
  it('renders the poster image when a posterUrl is provided', () => {
    render(<VideoPlayer title="Live Set" src="/clip.mp4" posterUrl="/poster.jpg" />);

    expect(screen.getByAltText('Live Set')).toHaveAttribute('src', '/poster.jpg');
  });

  it('renders a placeholder instead of a poster when posterUrl is nullish', () => {
    render(<VideoPlayer title="Live Set" src="/clip.mp4" posterUrl={null} />);

    expect(screen.queryByAltText('Live Set')).not.toBeInTheDocument();
  });

  it('exposes an accessible, labelled play button', () => {
    render(<VideoPlayer title="Live Set" src="/clip.mp4" posterUrl={null} />);

    expect(screen.getByRole('button', { name: 'Play Live Set' })).toBeInTheDocument();
  });

  it('disables the play button when src is null', () => {
    render(<VideoPlayer title="Live Set" src={null} posterUrl={null} />);

    expect(screen.getByRole('button', { name: 'Play Live Set' })).toBeDisabled();
  });

  it('does not mount the video surface before activation', () => {
    render(<VideoPlayer title="Live Set" src="/clip.mp4" posterUrl={null} />);

    expect(screen.queryByTestId('video-surface')).not.toBeInTheDocument();
  });

  it('mounts the video surface when the play button is activated', async () => {
    const user = userEvent.setup();
    render(<VideoPlayer title="Live Set" src="/clip.mp4" posterUrl={null} />);

    await user.click(screen.getByRole('button', { name: 'Play Live Set' }));

    expect(screen.getByTestId('video-surface')).toBeInTheDocument();
  });
});
