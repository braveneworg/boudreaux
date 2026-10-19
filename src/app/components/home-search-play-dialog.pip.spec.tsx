/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRef } from 'react';

import { act, render, screen } from '@testing-library/react';

import type { ArtistNavSearchVideo } from '@/hooks/queries/use-artist-nav-search-query';

import { HomeSearchPlayDialog, type HomeSearchPlayDialogHandle } from './home-search-play-dialog';

// Picture-in-picture through the real `VideoPlayDialog`: hiding the modal
// unmounts its Radix content, which fires `onCloseAutoFocus` though nothing
// closed. The pick must survive that, or the player is disposed and the modal
// can never come back (#877).

interface SurfaceProps {
  onEnterPictureInPicture?: () => void;
  onLeavePictureInPicture?: (isPaused: boolean) => void;
}

const surface = vi.hoisted((): SurfaceProps & { unmounts: number } => ({ unmounts: 0 }));
vi.mock('@/components/ui/video/lazy-video-surface', async () => {
  const { useEffect } = await import('react');
  return {
    LazyVideoSurface: (props: SurfaceProps) => {
      surface.onEnterPictureInPicture = props.onEnterPictureInPicture;
      surface.onLeavePictureInPicture = props.onLeavePictureInPicture;
      useEffect(
        () => () => {
          surface.unmounts += 1;
        },
        []
      );
      return <div data-testid="video-surface" />;
    },
  };
});

// The listening modal's player, never opened here.
vi.mock('./release-player', () => ({ ReleasePlayer: () => null }));
vi.mock('./playlists/add-to-playlist-menu', () => ({ AddToPlaylistMenu: () => null }));

const VIDEO: ArtistNavSearchVideo = {
  id: 'v-1',
  title: 'Live at the Basement',
  posterSrc: null,
  streamUrl: 'https://cdn.example.com/v-1.mp4?signed',
  year: 2025,
  durationSeconds: 125,
};

/** Let Radix's unmount focus handling (a zero-delay timer) run. */
const flushUnmountFocus = (): Promise<void> =>
  act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  });

const openVideo = () => {
  const handle = createRef<HomeSearchPlayDialogHandle>();
  const trigger = createRef<HTMLButtonElement>();
  render(
    <>
      <button type="button" ref={trigger}>
        Search
      </button>
      <HomeSearchPlayDialog ref={handle} returnFocusRef={trigger} pickAccent={() => 'teal'} />
    </>
  );
  act(() =>
    handle.current?.openVideo({ artistName: 'Marguerite Ash', artistSlug: 'marguerite-ash' }, VIDEO)
  );
  return { trigger };
};

beforeEach(() => {
  surface.unmounts = 0;
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HomeSearchPlayDialog in picture-in-picture', () => {
  it('keeps the pick and its player while the modal hides', async () => {
    const { trigger } = openVideo();
    const player = screen.getByTestId('video-surface');

    act(() => surface.onEnterPictureInPicture?.());
    await flushUnmountFocus();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('video-surface')).toBe(player);
    expect(surface.unmounts).toBe(0);
    expect(trigger.current).not.toHaveFocus();
  });

  it('shows the modal again around the same player on going back to the tab', async () => {
    openVideo();
    const player = screen.getByTestId('video-surface');

    act(() => surface.onEnterPictureInPicture?.());
    await flushUnmountFocus();
    act(() => surface.onLeavePictureInPicture?.(false));

    expect(screen.getByRole('dialog', { name: 'Marguerite Ash' })).toBeInTheDocument();
    expect(screen.getByTestId('video-surface')).toBe(player);
    expect(surface.unmounts).toBe(0);
  });

  it('disposes the player when picture-in-picture is closed paused', async () => {
    openVideo();

    act(() => surface.onEnterPictureInPicture?.());
    await flushUnmountFocus();
    act(() => surface.onLeavePictureInPicture?.(true));

    expect(screen.queryByTestId('video-surface')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
