/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast, Toaster } from 'sonner';

import { gateAction } from '@/lib/auth/action-gate';
import { MAX_PLAYLIST_ITEMS } from '@/lib/constants/playlists';
import { PlaylistRepository } from '@/lib/repositories/playlist-repository';
import type { TrackFileWithRelease } from '@/lib/repositories/release-digital-format-file-repository';
import type {
  PlaylistItemRecord,
  PlaylistListRow,
  PlaylistRecord,
  PlaylistSearchItem,
} from '@/lib/types/domain/playlist';
import { createQueryClient } from '@/test-utils/create-query-wrapper';

import { AddToPlaylistPanel } from './add-to-playlist-panel';

/*
 * The add-to-playlist panel end to end, as a listener sees it: the real
 * panel, add hook, mutation, Server Action and PlaylistService run; only the
 * data layer (repositories), the session gate and the playlists listing query
 * are stubbed. What is asserted is the toast text on screen.
 */

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/action-gate');

const { trackFileRepoMock, usePlaylistsQueryMock } = vi.hoisted(() => ({
  trackFileRepoMock: { findManyByIdsWithRelease: vi.fn() },
  usePlaylistsQueryMock: vi.fn(),
}));

vi.mock('@/lib/repositories/playlist-repository', () => ({
  PlaylistRepository: {
    findById: vi.fn(),
    findDuplicateItem: vi.fn(),
    addItem: vi.fn(),
  },
}));

vi.mock('@/lib/repositories/release-digital-format-file-repository', () => ({
  ReleaseDigitalFormatFileRepository: class {
    findManyByIdsWithRelease = trackFileRepoMock.findManyByIdsWithRelease;
  },
}));

vi.mock('@/lib/repositories/video-repository', () => ({
  VideoRepository: { findManyByIds: vi.fn() },
}));

vi.mock('@/lib/services/release-service', () => ({ ReleaseService: {} }));
vi.mock('@/lib/services/artist-service', () => ({ ArtistService: {} }));

vi.mock('./_hooks/use-playlists-query', () => ({
  usePlaylistsQuery: usePlaylistsQueryMock,
}));

const USER_ID = 'user-1';
const PLAYLIST_ID = '507f1f77bcf86cd799439011';
const TRACK_FILE_ID = '507f1f77bcf86cd799439012';
const RELEASE_ID = '507f1f77bcf86cd799439016';
const NOW = new Date('2026-07-01T12:00:00.000Z');

const ROAD_TRIP: PlaylistListRow = {
  id: PLAYLIST_ID,
  title: 'Road Trip',
  isPublic: false,
  coverImages: [],
  itemCount: 3,
  totalDuration: 540,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const ITEM: PlaylistSearchItem = {
  key: `track:${TRACK_FILE_ID}`,
  itemType: 'track',
  title: 'Cold Wind',
  artistName: 'Ceschi',
  coverArt: null,
  duration: 125,
  source: { trackFileId: TRACK_FILE_ID, releaseId: RELEASE_ID },
};

const makePlaylist = (overrides: Partial<PlaylistRecord> = {}): PlaylistRecord => ({
  id: PLAYLIST_ID,
  ownerId: USER_ID,
  title: 'Road Trip',
  isPublic: false,
  coverImages: [],
  itemCount: 3,
  totalDuration: 540,
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const TRACK_FILE: TrackFileWithRelease = {
  id: TRACK_FILE_ID,
  trackNumber: 1,
  title: 'Cold Wind',
  duration: 125,
  s3Key: `releases/${RELEASE_ID}/tracks/01-cold-wind.mp3`,
  fileName: '01-cold-wind.mp3',
  mimeType: 'audio/mpeg',
  format: {
    formatType: 'MP3_320KBPS',
    releaseId: RELEASE_ID,
    release: {
      id: RELEASE_ID,
      title: 'Sad, Fat Luck',
      coverArt: 'https://cdn.test/covers/sad-fat-luck.jpg',
      publishedAt: NOW,
      artistReleases: [],
    },
  },
};

const ADDED_ITEM: PlaylistItemRecord = {
  id: 'item-new',
  playlistId: PLAYLIST_ID,
  itemType: 'track',
  trackFileId: TRACK_FILE_ID,
  releaseId: RELEASE_ID,
  videoId: null,
  title: 'Cold Wind',
  artistName: 'Ceschi',
  duration: 125,
  sortOrder: 3,
  addedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
};

const renderPanel = (): void => {
  const queryClient = createQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <Wrapper>
      <AddToPlaylistPanel item={ITEM} onCreatePlaylist={vi.fn()} />
      <Toaster />
    </Wrapper>
  );
};

const pickRoadTrip = async (): Promise<void> => {
  const user = userEvent.setup();
  await user.click(screen.getByRole('option', { name: 'Road Trip' }));
};

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', 'cdn.test');
  vi.mocked(gateAction).mockResolvedValue({
    success: true,
    session: { user: { id: USER_ID } } as never,
  });
  usePlaylistsQueryMock.mockReturnValue({
    isPending: false,
    error: null,
    rows: [ROAD_TRIP],
    nextSkip: null,
    loadMore: vi.fn(),
    isLoadingMore: false,
    refetch: vi.fn(),
  });
  vi.mocked(PlaylistRepository.findById).mockResolvedValue(makePlaylist());
  vi.mocked(PlaylistRepository.findDuplicateItem).mockResolvedValue(null);
  vi.mocked(PlaylistRepository.addItem).mockResolvedValue(ADDED_ITEM);
  trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([TRACK_FILE]);
});

const FULL_COPY = 'This playlist is full — playlists hold up to 200 items.';
const SOURCE_GONE_COPY = 'This song or video is no longer available.';

afterEach(() => {
  // Sonner keeps its toasts in a module-level store that outlives the
  // Toaster, so a toast from one case would surface in the next.
  toast.dismiss();
});

describe('Adding to a playlist from the panel', () => {
  it('tells the listener the playlist is full, in words', async () => {
    vi.mocked(PlaylistRepository.findById).mockResolvedValue(
      makePlaylist({ itemCount: MAX_PLAYLIST_ITEMS })
    );
    renderPanel();

    await pickRoadTrip();

    expect(await screen.findByText(FULL_COPY)).toBeInTheDocument();
  });

  it('never shows the full-playlist code', async () => {
    vi.mocked(PlaylistRepository.findById).mockResolvedValue(
      makePlaylist({ itemCount: MAX_PLAYLIST_ITEMS })
    );
    renderPanel();

    await pickRoadTrip();
    await screen.findByText(FULL_COPY);

    expect(screen.queryByText('PLAYLIST_FULL')).not.toBeInTheDocument();
  });

  it('tells the listener a song that is gone can no longer be added', async () => {
    trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([]);
    renderPanel();

    await pickRoadTrip();

    expect(await screen.findByText(SOURCE_GONE_COPY)).toBeInTheDocument();
  });

  it('never shows the missing-source code', async () => {
    trackFileRepoMock.findManyByIdsWithRelease.mockResolvedValue([]);
    renderPanel();

    await pickRoadTrip();
    await screen.findByText(SOURCE_GONE_COPY);

    expect(screen.queryByText('SOURCE_NOT_FOUND')).not.toBeInTheDocument();
  });

  it('asks before adding a song twice, then adds it on confirm', async () => {
    const user = userEvent.setup();
    vi.mocked(PlaylistRepository.findDuplicateItem).mockResolvedValueOnce(ADDED_ITEM);
    renderPanel();

    await pickRoadTrip();
    await user.click(await screen.findByRole('button', { name: 'Add again' }));

    expect(await screen.findByText('Added to Road Trip')).toBeInTheDocument();
  });

  it('says the playlist is gone when it no longer exists', async () => {
    vi.mocked(PlaylistRepository.findById).mockResolvedValue(null);
    renderPanel();

    await pickRoadTrip();

    expect(await screen.findByText('Playlist not found')).toBeInTheDocument();
  });
});
