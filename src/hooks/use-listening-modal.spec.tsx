/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useState, type ReactElement } from 'react';

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { claimPlayback, releasePlayback } from '@/app/components/ui/playback-session';
import { zineAccentForRelease } from '@/app/components/ui/zine-panel';

import {
  useListeningModal,
  type ListeningModal,
  type ListeningModalOptions,
  type ListeningModalRelease,
} from './use-listening-modal';

// The external edges only: the release detail fetch, the video.js player, the
// lazily-loaded social links, and the browser's media playback below.
const query = vi.hoisted(() => ({ useReleaseQuery: vi.fn() }));
vi.mock('@/hooks/queries/use-release-query', () => ({
  useReleaseQuery: (...args: unknown[]): unknown => query.useReleaseQuery(...args),
}));

const player = vi.hoisted(() => ({
  /** The session id the stand-in claims with, as the real player claims with its own. */
  id: 'release-player',
  adopted: [] as Array<HTMLAudioElement | null>,
  /** Every `autoPlay` the stand-in rendered with, closing renders included. */
  autoPlays: [] as boolean[],
}));
vi.mock('@/app/components/release-player', async () => {
  const { useEffect, useState: useStandInState } = await import('react');
  const session = await import('@/app/components/ui/playback-session');
  return {
    // Adopts the primed element and claims the playback session, as the real
    // player does once the element it adopted is playing.
    ReleasePlayer: ({
      autoPlay,
      takeMediaEl,
      initialTrackNumber,
    }: {
      autoPlay: boolean;
      takeMediaEl?: () => HTMLAudioElement | null;
      initialTrackNumber?: number;
    }) => {
      const [adopted] = useStandInState(() => takeMediaEl?.() ?? null);
      player.autoPlays.push(autoPlay);
      useEffect(() => {
        player.adopted.push(adopted);
        session.claimPlayback(player.id, () => adopted?.pause());
        return () => session.releasePlayback(player.id);
      }, [adopted]);
      return (
        <div
          data-testid="release-player"
          data-autoplay={String(autoPlay)}
          data-initial-track-number={initialTrackNumber ?? ''}
        />
      );
    },
  };
});

vi.mock('@/app/components/social-share-widget', () => ({
  SocialShareWidget: ({ url }: { url: string }) => (
    <div data-testid="social-share-widget" data-url={url} />
  ),
}));

const HOST = 'https://fakefour.test';
const PREVIOUS_PLAYER = 'previous-player';
const NEXT_PLAYER = 'next-player';

const RELEASE: ListeningModalRelease = {
  id: '0123456789abcdef01234567',
  title: 'Paper Moons',
  artistName: 'Marguerite Ash',
  artistSlug: 'marguerite-ash',
  playSrc: 'https://cdn.example.com/r-1/01.mp3',
};

const PICK: ListeningModalRelease = {
  id: '89abcdef0123456789abcdef',
  title: 'Night Shift',
  artistName: 'Ceschi',
  artistSlug: 'ceschi',
  playSrc: 'https://cdn.example.com/r-2/01.mp3',
};

/** The interface the opener last got, for closing it from caller code. */
const latest = vi.hoisted(() => ({ current: null as ListeningModal | null }));

interface OpenerProps extends Partial<ListeningModalOptions> {
  /** A release the Play click picks inside its gesture, as a search pick does. */
  pick?: ListeningModalRelease;
}

/** An opener as the six use the module: a trigger, a warm on intent, the modal. */
const Opener = ({ pick, release = RELEASE, ...options }: OpenerProps): ReactElement => {
  const [picked, setPicked] = useState<ListeningModalRelease | null>(null);
  const listening = useListeningModal({ ...options, release: picked ?? release });
  latest.current = listening;

  const play = (): void => {
    if (pick) setPicked(pick);
    listening.open(pick);
  };

  return (
    <>
      <button type="button" onClick={play} onPointerEnter={listening.warm}>
        Play
      </button>
      {listening.modal}
    </>
  );
};

/** Click Play the way a visitor does: one synchronous gesture. */
const clickPlay = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Play' }));
};

const dialog = (): HTMLElement => screen.getByRole('dialog');

/** The media elements a spied method was called on, in call order. */
const callTargets = (spy: { mock: { instances: unknown[] } }): unknown[] => spy.mock.instances;

const playSpy = () => vi.mocked(HTMLMediaElement.prototype.play);
const pauseSpy = () => vi.mocked(HTMLMediaElement.prototype.pause);

describe('useListeningModal', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_HOST_NAME', HOST);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    query.useReleaseQuery.mockReturnValue({
      isPending: false,
      isError: false,
      data: { id: RELEASE.id, title: RELEASE.title },
    });
    player.adopted = [];
    player.autoPlays = [];
    latest.current = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    [PREVIOUS_PLAYER, NEXT_PLAYER].forEach(releasePlayback);
  });

  describe('opening in a gesture', () => {
    it('starts the release’s track inside the opening gesture', () => {
      render(<Opener />);

      clickPlay();

      // Asserted before anything else runs: the play() came from the click.
      expect(playSpy()).toHaveBeenCalledTimes(1);
      const [primed] = callTargets(playSpy());
      expect(primed).toBeInstanceOf(HTMLAudioElement);
      expect(primed).toHaveAttribute('src', RELEASE.playSrc);
    });

    it('opens the modal on the release, its player playing', () => {
      render(<Opener />);

      clickPlay();

      expect(dialog()).toHaveAccessibleName('Paper Moons');
      expect(screen.getByTestId('release-player')).toHaveAttribute('data-autoplay', 'true');
    });

    it('pauses whoever held the playback session at the click', () => {
      const pausePrevious = vi.fn();
      claimPlayback(PREVIOUS_PLAYER, pausePrevious);
      query.useReleaseQuery.mockReturnValue({ isPending: true, isError: false, data: undefined });
      render(<Opener />);

      clickPlay();

      expect(pausePrevious).toHaveBeenCalledTimes(1);
    });

    it('hands the playing element to the player, whose own claim never pauses it', () => {
      render(<Opener />);

      clickPlay();

      const [primed] = callTargets(playSpy());
      expect(player.adopted).toEqual([primed]);
      expect(callTargets(pauseSpy())).not.toContain(primed);
    });

    it('opens unprimed when the release has no track to start, on the player’s own play', () => {
      render(<Opener release={{ ...RELEASE, playSrc: null }} />);

      clickPlay();

      expect(playSpy()).not.toHaveBeenCalled();
      expect(screen.getByTestId('release-player')).toHaveAttribute('data-autoplay', 'true');
      expect(player.adopted).toEqual([null]);
    });

    it('starts a release picked inside the gesture, and opens on it', () => {
      render(<Opener release={null} pick={PICK} />);

      clickPlay();

      expect(callTargets(playSpy())[0]).toHaveAttribute('src', PICK.playSrc);
      expect(dialog()).toHaveAccessibleName('Night Shift');
    });

    it('renders no modal without a release', () => {
      render(<Opener release={null} />);

      clickPlay();

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('opening on arrival', () => {
    it('is open on the first render, paused and unprimed', () => {
      render(<Opener openOnArrival />);

      expect(dialog()).toHaveAccessibleName('Paper Moons');
      expect(screen.getByTestId('release-player')).toHaveAttribute('data-autoplay', 'false');
      expect(playSpy()).not.toHaveBeenCalled();
      expect(player.adopted).toEqual([null]);
    });

    // The dialog keeps its content, and so the player, mounted for the exit
    // animation: a close must not hand that player an autoPlay to act on.
    it('stays paused while it closes', () => {
      render(<Opener openOnArrival />);

      act(() => latest.current?.close());

      expect(player.autoPlays).not.toContain(true);
    });
  });

  describe('closing', () => {
    beforeEach(() => {
      // The release detail is still loading, so the player has not taken the
      // element the click started.
      query.useReleaseQuery.mockReturnValue({ isPending: true, isError: false, data: undefined });
    });

    it('stops an element the player never took', async () => {
      const user = userEvent.setup({ delay: null });
      render(<Opener />);
      clickPlay();
      const [primed] = callTargets(playSpy());

      await user.click(within(dialog()).getByRole('button', { name: 'Close' }));

      expect(callTargets(pauseSpy())).toEqual([primed]);
      expect(primed).not.toHaveAttribute('src');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('gives up the stopped element’s session claim', async () => {
      const user = userEvent.setup({ delay: null });
      render(<Opener />);
      clickPlay();
      await user.click(within(dialog()).getByRole('button', { name: 'Close' }));
      pauseSpy().mockClear();

      claimPlayback(NEXT_PLAYER, vi.fn());

      expect(pauseSpy()).not.toHaveBeenCalled();
    });

    it('stops an untaken element when the opener unmounts', () => {
      const { unmount } = render(<Opener />);
      clickPlay();
      const [primed] = callTargets(playSpy());

      unmount();

      expect(callTargets(pauseSpy())).toEqual([primed]);
    });

    it('closes from caller code, as a footer link does before it navigates', () => {
      render(<Opener />);
      clickPlay();
      const [primed] = callTargets(playSpy());

      act(() => latest.current?.close());

      expect(callTargets(pauseSpy())).toEqual([primed]);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('tells the caller when the visitor dismisses it', async () => {
      const user = userEvent.setup({ delay: null });
      const onClose = vi.fn();
      render(<Opener onClose={onClose} />);
      clickPlay();

      await user.click(within(dialog()).getByRole('button', { name: 'Close' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('tells the caller when caller code closes it', () => {
      const onClose = vi.fn();
      render(<Opener openOnArrival onClose={onClose} />);

      act(() => latest.current?.close());

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('the accent', () => {
    it('frames the modal in the release’s own accent by default', () => {
      render(<Opener />);

      clickPlay();

      expect(dialog()).toHaveClass(`zine-accent-${zineAccentForRelease(RELEASE.id)}`);
    });

    it('frames the modal in an accent the caller gives', () => {
      render(<Opener accent="cyan" />);

      clickPlay();

      expect(dialog()).toHaveClass('zine-accent-cyan');
    });

    it('draws a new loud accent inside each opening gesture when asked for a random one', async () => {
      const user = userEvent.setup({ delay: null });
      vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.95);
      render(<Opener accent="random" />);

      clickPlay();
      expect(dialog()).toHaveClass('zine-accent-cyan');
      await user.click(within(dialog()).getByRole('button', { name: 'Close' }));
      clickPlay();

      expect(dialog()).toHaveClass('zine-accent-orchid');
    });
  });

  describe('the share row', () => {
    it('shares the release deep link', async () => {
      render(<Opener />);

      clickPlay();

      expect(await screen.findByTestId('social-share-widget')).toHaveAttribute(
        'data-url',
        `${HOST}/releases?artist=marguerite-ash&release=${RELEASE.id}`
      );
    });

    it('shares the site, not a deep link, when the release names no artist slug', async () => {
      render(<Opener release={{ ...RELEASE, artistSlug: null }} />);

      clickPlay();

      expect(await screen.findByTestId('social-share-widget')).toHaveAttribute('data-url', HOST);
    });

    it('shares the artist’s page when asked, as the spotlight does', async () => {
      render(<Opener share="artist-page" />);

      clickPlay();

      expect(await screen.findByTestId('social-share-widget')).toHaveAttribute(
        'data-url',
        `${HOST}/artists/marguerite-ash`
      );
    });
  });

  describe('the presentation', () => {
    it('lays out a sheet: the artist leads a centered heading, a bottom sheet on phones', () => {
      render(<Opener layout="sheet" />);

      clickPlay();

      expect(dialog()).toHaveAccessibleName('Marguerite Ash');
      expect(screen.getByText('Marguerite Ash')).toHaveClass('text-center');
      expect(dialog()).toHaveClass('max-sm:bottom-0');
    });

    it('titles a dialog with the release by default, a centered dialog on phones', () => {
      render(<Opener />);

      clickPlay();

      expect(dialog()).toHaveAccessibleName('Paper Moons');
      expect(dialog()).not.toHaveClass('max-sm:bottom-0');
    });

    it('links the artist, adds the year and puts the caller’s footer under the player', () => {
      render(
        <Opener
          artistHref="/artists/marguerite-ash"
          year={2024}
          footer={<a href="/releases?artist=marguerite-ash">View all releases</a>}
        />
      );

      clickPlay();

      expect(dialog()).toHaveAccessibleName('Paper Moons (2024)');
      expect(within(dialog()).getByRole('link', { name: 'Marguerite Ash' })).toHaveAttribute(
        'href',
        '/artists/marguerite-ash'
      );
      expect(within(dialog()).getByRole('link', { name: 'View all releases' })).toBeInTheDocument();
    });

    it('starts the player on the caller’s track', () => {
      render(<Opener initialTrackNumber={3} />);

      clickPlay();

      expect(screen.getByTestId('release-player')).toHaveAttribute(
        'data-initial-track-number',
        '3'
      );
    });

    it('lets the caller decide where focus returns on close', async () => {
      const user = userEvent.setup({ delay: null });
      const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault());
      render(<Opener onCloseAutoFocus={onCloseAutoFocus} />);
      clickPlay();

      await user.click(within(dialog()).getByRole('button', { name: 'Close' }));

      await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalledTimes(1));
    });
  });

  describe('warming', () => {
    it('fetches the release detail on intent, before the modal opens', () => {
      render(<Opener />);
      expect(query.useReleaseQuery).toHaveBeenLastCalledWith(RELEASE.id, { enabled: false });

      fireEvent.pointerEnter(screen.getByRole('button', { name: 'Play' }));

      expect(query.useReleaseQuery).toHaveBeenLastCalledWith(RELEASE.id, { enabled: true });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
