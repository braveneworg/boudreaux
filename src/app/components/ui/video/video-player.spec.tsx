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
const surfaceProps = vi.hoisted((): { takeMediaEl?: () => HTMLVideoElement | null } => ({
  takeMediaEl: undefined,
}));
vi.mock('./lazy-video-surface', () => ({
  LazyVideoSurface: (props: { title: string; takeMediaEl?: () => HTMLVideoElement | null }) => {
    surfaceProps.takeMediaEl = props.takeMediaEl;
    return createElement('div', { 'data-testid': 'video-surface' }, `surface:${props.title}`);
  },
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

  // Deferred playback only works cross-browser when the media element is
  // load()ed/play()ed synchronously inside the click's user gesture —
  // Safari/iOS and Firefox reject a later programmatic play() on an unprimed
  // element, which is exactly the "click play twice" bug.
  describe('gesture-time media element priming', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('primes a media element inside the play click gesture', async () => {
      const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play');
      const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load');
      const user = userEvent.setup();
      render(<VideoPlayer title="Live Set" src="/clip.mp4" posterUrl={null} />);

      await user.click(screen.getByRole('button', { name: 'Play Live Set' }));

      expect(loadSpy).toHaveBeenCalledTimes(1);
      expect(playSpy).toHaveBeenCalledTimes(1);
    });

    it('hands the surface a primed inline-playback video element', async () => {
      const user = userEvent.setup();
      render(<VideoPlayer title="Live Set" src="/clip.mp4" posterUrl={null} />);

      await user.click(screen.getByRole('button', { name: 'Play Live Set' }));

      const primed = surfaceProps.takeMediaEl?.();
      expect(primed).toBeInstanceOf(HTMLVideoElement);
      expect(primed?.getAttribute('playsinline')).toBe('');
    });

    it('hands the primed element over only once', async () => {
      const user = userEvent.setup();
      render(<VideoPlayer title="Live Set" src="/clip.mp4" posterUrl={null} />);

      await user.click(screen.getByRole('button', { name: 'Play Live Set' }));
      surfaceProps.takeMediaEl?.();

      expect(surfaceProps.takeMediaEl?.()).toBeNull();
    });

    it('swallows a rejected priming play() so the click never throws', async () => {
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() =>
        Promise.reject(new Error('no source'))
      );
      const user = userEvent.setup();
      render(<VideoPlayer title="Live Set" src="/clip.mp4" posterUrl={null} />);

      await user.click(screen.getByRole('button', { name: 'Play Live Set' }));

      expect(screen.getByTestId('video-surface')).toBeInTheDocument();
    });
  });
});
