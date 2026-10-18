/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRef, type ReactNode } from 'react';

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type {
  ArtistNavSearchRelease,
  ArtistNavSearchVideo,
} from '@/hooks/queries/use-artist-nav-search-query';

import { HomeSearchPlayDialog, type HomeSearchPlayDialogHandle } from './home-search-play-dialog';
import { zineAccentForRelease } from './ui/zine-panel';

// The listening modal is real; only its external edges are stood in for: the
// release detail fetch, the video.js player and the lazily-loaded social links.
vi.mock('@/hooks/queries/use-release-query', () => ({
  useReleaseQuery: () => ({ isPending: true, isError: false, data: undefined }),
}));

vi.mock('./release-player', () => ({
  ReleasePlayer: () => <div data-testid="release-player" />,
}));

vi.mock('./social-share-widget', () => ({
  SocialShareWidget: ({ url }: { url: string }) => (
    <div data-testid="social-share-widget" data-url={url} />
  ),
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
  action?: ReactNode;
  [key: string]: unknown;
}

// A sentinel video dialog: records the props the home search wires in,
// without pulling in Radix or video.js.
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

const play = () => vi.mocked(HTMLMediaElement.prototype.play);
const pause = () => vi.mocked(HTMLMediaElement.prototype.pause);
const dialog = (): HTMLElement => screen.getByRole('dialog');

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_HOST_NAME', 'https://fakefour.test');
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  videoDialog.props = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HomeSearchPlayDialog', () => {
  it('renders no dialog until a pick opens one', () => {
    renderDialog();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByTestId('video-dialog')).toBeNull();
  });

  describe('a release pick', () => {
    it('plays the first track inside the gesture', () => {
      const { handle } = renderDialog();

      act(() => handle.current?.openRelease(ARTIST, RELEASE));

      expect(play()).toHaveBeenCalledTimes(1);
      expect(play().mock.instances[0]).toBeInstanceOf(HTMLAudioElement);
      expect(play().mock.instances[0]).toHaveAttribute('src', 'https://cdn.example.com/r-1/01.mp3');
    });

    it('opens the listening modal as a sheet, bylined and linked to the artist', () => {
      const { handle } = renderDialog();

      act(() => handle.current?.openRelease(ARTIST, RELEASE));

      expect(dialog()).toHaveAccessibleName('Marguerite Ash');
      expect(dialog()).toHaveAccessibleDescription('Paper Moons (2024)');
      expect(dialog()).toHaveClass('max-sm:bottom-0');
      expect(within(dialog()).getByRole('link', { name: 'Marguerite Ash' })).toHaveAttribute(
        'href',
        '/artists/marguerite-ash'
      );
    });

    it('links "View all releases" to the artist’s releases', () => {
      const { handle } = renderDialog();

      act(() => handle.current?.openRelease(ARTIST, RELEASE));

      expect(within(dialog()).getByRole('link', { name: 'View all releases' })).toHaveAttribute(
        'href',
        '/releases?artist=marguerite-ash'
      );
    });

    it('shares the release deep link from the release dialog', async () => {
      const { handle } = renderDialog();

      act(() => handle.current?.openRelease(ARTIST, RELEASE));

      expect(await screen.findByTestId('social-share-widget')).toHaveAttribute(
        'data-url',
        'https://fakefour.test/releases?artist=marguerite-ash&release=r-1'
      );
    });

    it("frames the release in its own accent, never the picker's", () => {
      const { handle, pickAccent } = renderDialog();

      act(() => handle.current?.openRelease(ARTIST, RELEASE));

      expect(dialog()).toHaveClass(`zine-accent-${zineAccentForRelease('r-1')}`);
      expect(pickAccent).not.toHaveBeenCalled();
    });

    it('opens a release with no public album artist without byline links or a deep link', async () => {
      const { handle } = renderDialog();

      act(() => handle.current?.openRelease({ artistName: null, artistSlug: null }, RELEASE));

      expect(dialog()).toHaveAccessibleName('Paper Moons (2024)');
      expect(within(dialog()).queryByRole('link')).toBeNull();
      expect(await screen.findByTestId('social-share-widget')).toHaveAttribute(
        'data-url',
        'https://fakefour.test'
      );
    });

    it('opens unprimed for a release without a playable track', () => {
      const { handle } = renderDialog();

      act(() => handle.current?.openRelease(ARTIST, { ...RELEASE, playSrc: null }));

      expect(play()).not.toHaveBeenCalled();
      expect(dialog()).toBeInTheDocument();
    });

    it('stops the track, forgets the pick and returns focus to the search trigger once closed', async () => {
      const user = userEvent.setup({ delay: null });
      const { handle, trigger } = renderDialog();
      act(() => handle.current?.openRelease(ARTIST, RELEASE));
      const primed = play().mock.instances[0];

      await user.click(within(dialog()).getByRole('button', { name: 'Close' }));

      await waitFor(() => expect(trigger.current).toHaveFocus());
      expect(pause().mock.instances).toEqual([primed]);
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  describe('a video pick', () => {
    it('primes the stream inside the gesture and opens the video dialog', () => {
      const { handle } = renderDialog();

      act(() => handle.current?.openVideo(ARTIST, VIDEO));

      const primed = play().mock.instances[0];
      expect(primed).toBeInstanceOf(HTMLVideoElement);
      expect(primed).toHaveAttribute('src', 'https://cdn.example.com/v-1.mp4?signed');
      expect(screen.getByTestId('video-dialog')).toHaveTextContent('Live at the Basement');
      expect(videoDialog.props).toMatchObject({
        open: true,
        title: 'Live at the Basement',
        artist: 'Marguerite Ash',
        src: 'https://cdn.example.com/v-1.mp4?signed',
        headingOrder: 'artist-first',
        centered: true,
        artistHref: '/artists/marguerite-ash',
        year: 2025,
      });
      expect(videoDialog.props?.takeMediaEl()).toBe(primed);
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

      expect(play()).not.toHaveBeenCalled();
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

  it('closing the video dialog stops an element the player never took', () => {
    const { handle } = renderDialog();

    act(() => handle.current?.openVideo(ARTIST, VIDEO));
    const primed = play().mock.instances[0];
    act(() => videoDialog.props?.onOpenChange(false));

    expect(pause().mock.instances).toEqual([primed]);
    expect(screen.getByTestId('video-dialog')).toHaveAttribute('data-open', 'false');
  });

  it('discards a closed video pick and returns focus to the search trigger', () => {
    const { handle, trigger } = renderDialog();

    act(() => handle.current?.openVideo(ARTIST, VIDEO));
    act(() => videoDialog.props?.onOpenChange(false));
    const event = new Event('focusout', { cancelable: true });
    act(() => videoDialog.props?.onCloseAutoFocus?.(event));

    expect(event.defaultPrevented).toBe(true);
    expect(trigger.current).toHaveFocus();
    expect(screen.queryByTestId('video-dialog')).toBeNull();
  });
});
