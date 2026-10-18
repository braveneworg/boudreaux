/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRef, type ReactNode } from 'react';

import { act, render, screen } from '@testing-library/react';

import type {
  ArtistNavSearchRelease,
  ArtistNavSearchVideo,
} from '@/hooks/queries/use-artist-nav-search-query';

import { HomeSearchPlayDialog, type HomeSearchPlayDialogHandle } from './home-search-play-dialog';
import { zineAccentForRelease } from './ui/zine-panel';

const audio = vi.hoisted(() => ({
  primeMediaEl: vi.fn(),
  takeMediaEl: vi.fn(() => null),
  discardMediaEl: vi.fn(),
}));
const media = vi.hoisted(() => ({
  primeMediaEl: vi.fn(),
  takeMediaEl: vi.fn(() => null),
  discardMediaEl: vi.fn(),
}));
vi.mock('@/hooks/use-primed-media-handoff', () => ({
  usePrimedMediaHandoff: (kind: 'audio' | 'video') => (kind === 'audio' ? audio : media),
}));

interface DialogProps {
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  takeMediaEl: () => unknown;
  headingOrder?: string;
  centered?: boolean;
  accent?: string;
  artistHref?: string;
  year?: number;
  footer?: ReactNode;
  shareWidget?: ReactNode;
  action?: ReactNode;
  [key: string]: unknown;
}

// Sentinel dialogs: record the props the home search wires in, without
// pulling in Radix, the release query or video.js.
const releaseDialog = vi.hoisted((): { props?: DialogProps } => ({}));
vi.mock('./release-play-dialog', () => ({
  ReleasePlayDialog: (props: DialogProps) => {
    releaseDialog.props = props;
    // Mounted while there is a pick, open or closing; shown only while open.
    return (
      <div data-testid="release-dialog" data-open={String(props.open)}>
        {props.open ? (
          <>
            {props.title}
            {props.shareWidget}
            {props.footer}
          </>
        ) : null}
      </div>
    );
  },
}));

vi.mock('./release-share-widget', () => ({
  ReleaseShareWidget: ({
    shareUrl,
    artistSlug,
  }: {
    shareUrl?: string;
    artistSlug: string | null;
  }) => (
    <div
      data-testid="share-widget"
      data-share-url={shareUrl ?? ''}
      data-artist-slug={artistSlug ?? ''}
    />
  ),
}));

const videoDialog = vi.hoisted((): { props?: DialogProps } => ({}));
vi.mock('@/components/ui/video/video-play-dialog', () => ({
  VideoPlayDialog: (props: DialogProps) => {
    videoDialog.props = props;
    return (
      <div data-testid="video-dialog" data-open={String(props.open)}>
        {props.open ? (
          <>
            {props.title}
            {props.footer}
            {props.action}
          </>
        ) : null}
      </div>
    );
  },
}));

vi.mock('./playlists/add-to-playlist-menu', () => ({
  AddToPlaylistMenu: ({ item }: { item: { key: string; coverArt: string | null } }) => (
    <button type="button" data-key={item.key} data-cover={item.coverArt ?? ''}>
      Add to a playlist
    </button>
  ),
}));

const ARTIST = { artistName: 'Marguerite Ash', artistSlug: 'marguerite-ash' };

const RELEASE: ArtistNavSearchRelease = {
  id: 'r-1',
  title: 'Paper Moons',
  coverArtSrc: null,
  playSrc: 'https://cdn.example.com/r-1/01.mp3',
  year: 2024,
};

const VIDEO: ArtistNavSearchVideo = {
  id: 'v-1',
  title: 'Live at the Basement',
  posterSrc: 'https://cdn.example.com/poster.jpg',
  streamUrl: 'https://cdn.example.com/v-1.mp4?signed',
  year: 2025,
  durationSeconds: 125,
};

const renderDialog = (pickAccent = vi.fn(() => 'orchid' as const)) => {
  const handle = createRef<HomeSearchPlayDialogHandle>();
  const trigger = createRef<HTMLButtonElement>();
  render(
    <>
      <button type="button" ref={trigger}>
        Search
      </button>
      <HomeSearchPlayDialog ref={handle} returnFocusRef={trigger} pickAccent={pickAccent} />
    </>
  );
  return { handle, trigger, pickAccent };
};

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_HOST_NAME', 'https://fakefour.test');
  releaseDialog.props = undefined;
  videoDialog.props = undefined;
});

describe('HomeSearchPlayDialog', () => {
  it('renders no dialog until a pick opens one', () => {
    renderDialog();

    expect(screen.queryByTestId('release-dialog')).toBeNull();
    expect(screen.queryByTestId('video-dialog')).toBeNull();
  });

  describe('a release pick', () => {
    it('primes the first track inside the gesture and opens the release dialog', () => {
      const { handle } = renderDialog();

      act(() => handle.current?.openRelease(ARTIST, RELEASE));

      expect(audio.primeMediaEl.mock.calls).toEqual([['https://cdn.example.com/r-1/01.mp3']]);
      expect(screen.getByTestId('release-dialog')).toHaveTextContent('Paper Moons');
      expect(releaseDialog.props).toMatchObject({
        open: true,
        releaseId: 'r-1',
        title: 'Paper Moons',
        artistName: 'Marguerite Ash',
        takeMediaEl: audio.takeMediaEl,
        headingOrder: 'artist-first',
        centered: true,
        sheetOnPhone: true,
        artistHref: '/artists/marguerite-ash',
        year: 2024,
      });
    });

    it('links "View all releases" to the artist’s releases', () => {
      const { handle } = renderDialog();

      act(() => handle.current?.openRelease(ARTIST, RELEASE));

      expect(screen.getByRole('link', { name: 'View all releases' })).toHaveAttribute(
        'href',
        '/releases?artist=marguerite-ash'
      );
    });

    it('shares the release deep link from the release dialog', () => {
      const { handle } = renderDialog();

      act(() => handle.current?.openRelease(ARTIST, RELEASE));

      expect(screen.getByTestId('share-widget')).toHaveAttribute(
        'data-share-url',
        'https://fakefour.test/releases?artist=marguerite-ash&release=r-1'
      );
    });

    it("frames the release in its own accent, never the picker's", () => {
      const { handle, pickAccent } = renderDialog();

      act(() => handle.current?.openRelease(ARTIST, RELEASE));

      expect(releaseDialog.props?.accent).toBe(zineAccentForRelease('r-1'));
      expect(pickAccent).not.toHaveBeenCalled();
    });

    it('opens a release with no public album artist without byline links or a deep link', () => {
      const { handle } = renderDialog();

      act(() => handle.current?.openRelease({ artistName: null, artistSlug: null }, RELEASE));

      expect(releaseDialog.props).toMatchObject({ open: true, artistName: null });
      expect(releaseDialog.props?.artistHref).toBeUndefined();
      expect(screen.queryByRole('link', { name: 'View all releases' })).toBeNull();
      expect(screen.getByTestId('share-widget')).toHaveAttribute('data-share-url', '');
    });

    it('primes nothing for a release without a playable track', () => {
      const { handle } = renderDialog();

      act(() => handle.current?.openRelease(ARTIST, { ...RELEASE, playSrc: null }));

      expect(audio.primeMediaEl).not.toHaveBeenCalled();
      expect(screen.getByTestId('release-dialog')).toBeInTheDocument();
    });
  });

  describe('a video pick', () => {
    it('primes the stream inside the gesture and opens the video dialog', () => {
      const { handle } = renderDialog();

      act(() => handle.current?.openVideo(ARTIST, VIDEO));

      expect(media.primeMediaEl.mock.calls).toEqual([['https://cdn.example.com/v-1.mp4?signed']]);
      expect(screen.getByTestId('video-dialog')).toHaveTextContent('Live at the Basement');
      expect(videoDialog.props).toMatchObject({
        open: true,
        title: 'Live at the Basement',
        artist: 'Marguerite Ash',
        src: 'https://cdn.example.com/v-1.mp4?signed',
        takeMediaEl: media.takeMediaEl,
        headingOrder: 'artist-first',
        centered: true,
        artistHref: '/artists/marguerite-ash',
        year: 2025,
      });
    });

    it('links "View all videos" to the artist’s videos', () => {
      const { handle } = renderDialog();

      act(() => handle.current?.openVideo(ARTIST, VIDEO));

      expect(screen.getByRole('link', { name: 'View all videos' })).toHaveAttribute(
        'href',
        '/videos?artist=marguerite-ash'
      );
    });

    it('offers the video to a playlist from the heading', () => {
      const { handle } = renderDialog();

      act(() => handle.current?.openVideo(ARTIST, VIDEO));

      const kebab = screen.getByRole('button', { name: 'Add to a playlist' });
      expect(kebab).toHaveAttribute('data-key', 'video:v-1');
      expect(kebab).toHaveAttribute('data-cover', 'https://cdn.example.com/poster.jpg');
    });

    it('opens the dialog without priming when the video has no stream URL', () => {
      const { handle } = renderDialog();

      act(() => handle.current?.openVideo(ARTIST, { ...VIDEO, streamUrl: null }));

      expect(media.primeMediaEl).not.toHaveBeenCalled();
      expect(videoDialog.props?.src).toBeNull();
    });
  });

  it('frames each video pick in a fresh accent from the picker', () => {
    const pickAccent = vi.fn().mockReturnValueOnce('cyan').mockReturnValueOnce('storm');
    const { handle } = renderDialog(pickAccent);

    act(() => handle.current?.openVideo(ARTIST, VIDEO));
    expect(videoDialog.props?.accent).toBe('cyan');

    act(() => handle.current?.openVideo(ARTIST, { ...VIDEO, id: 'v-2' }));
    expect(videoDialog.props?.accent).toBe('storm');
    expect(pickAccent).toHaveBeenCalledTimes(2);
  });

  it('closing stops an unclaimed primed element and closes the dialog', () => {
    const { handle } = renderDialog();

    act(() => handle.current?.openVideo(ARTIST, VIDEO));
    act(() => videoDialog.props?.onOpenChange(false));

    expect(media.discardMediaEl).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('video-dialog')).toHaveAttribute('data-open', 'false');
  });

  it('discards the pick and returns focus to the search trigger once closed', () => {
    const { handle, trigger } = renderDialog();

    act(() => handle.current?.openRelease(ARTIST, RELEASE));
    act(() => releaseDialog.props?.onOpenChange(false));
    const event = new Event('focusout', { cancelable: true });
    act(() => releaseDialog.props?.onCloseAutoFocus?.(event));

    expect(event.defaultPrevented).toBe(true);
    expect(trigger.current).toHaveFocus();
    expect(audio.discardMediaEl).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('release-dialog')).toBeNull();
  });
});
