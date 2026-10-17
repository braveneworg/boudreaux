/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ArtistNavSearchPanel, type ArtistNavSearchPanelProps } from './artist-nav-search-panel';

// Render next/image as a plain <img> so the thumbnail src and box can be asserted.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) =>
    createElement('img', { src, alt, className }),
}));

const release = (id: string, title: string, coverArtSrc: string | null) => ({
  id,
  title,
  coverArtSrc,
  playSrc: `https://cdn.example.com/${id}/01.mp3`,
  year: 2024,
});

const ceschi = {
  artistSlug: 'ceschi',
  artistName: 'Ceschi',
  thumbnailSrc: 'https://cdn.example.com/ceschi.jpg',
  releases: [
    release('r-1', 'Broken Bone Ballads', 'https://cdn.example.com/bbb.jpg'),
    release('r-2', 'Sad, Fat Luck', null),
  ],
  videos: [],
};
const ramos = {
  artistSlug: 'david-ramos',
  artistName: 'David Ramos',
  thumbnailSrc: null,
  releases: [release('r-3', 'That Down There', null)],
  videos: [],
};
const noReleases = {
  artistSlug: 'sixo',
  artistName: 'Sixo',
  thumbnailSrc: null,
  releases: [],
  videos: [],
};

const video = (id: string, title: string, posterSrc: string | null) => ({
  id,
  title,
  posterSrc,
  streamUrl: `https://cdn.example.com/${id}.mp4?signed`,
  year: 2025,
  durationSeconds: 125,
});

const ash = {
  artistSlug: 'marguerite-ash',
  artistName: 'Marguerite Ash',
  thumbnailSrc: null,
  releases: [release('r-4', 'Paper Moons', null)],
  videos: [
    video('v-1', 'Live at the Basement', 'https://cdn.example.com/media/videos/v-1/poster.jpg'),
    video('v-2', 'Tour Diary', null),
  ],
};
const videoOnly = {
  artistSlug: 'sole',
  artistName: 'Sole',
  thumbnailSrc: null,
  releases: [],
  videos: [video('v-3', 'Session', null)],
};

const renderPanel = (overrides: Partial<ArtistNavSearchPanelProps> = {}) => {
  const props: ArtistNavSearchPanelProps = {
    query: 'ces',
    onQueryChange: vi.fn(),
    isSearching: false,
    isError: false,
    results: [ceschi, ramos],
    onArtistSelect: vi.fn(),
    onReleaseSelect: vi.fn(),
    onVideoSelect: vi.fn(),
    ...overrides,
  };
  return { ...render(<ArtistNavSearchPanel {...props} />), props };
};

describe('ArtistNavSearchPanel', () => {
  it('keeps its field at 16px on small screens, so iOS Safari does not zoom the page on focus', () => {
    renderPanel();

    const field = screen.getByPlaceholderText('Search artists, releases & videos');
    expect(field).toHaveClass('text-base', 'md:text-sm');
    expect(field).not.toHaveClass('text-sm');
  });

  it('focuses its search field on mount, since it lands in an already-open popover', () => {
    renderPanel();

    expect(screen.getByPlaceholderText('Search artists, releases & videos')).toHaveFocus();
  });

  it('forwards typed input to onQueryChange', async () => {
    const user = userEvent.setup();
    const { props } = renderPanel({ query: '' });

    await user.type(screen.getByPlaceholderText('Search artists, releases & videos'), 'c');

    expect(props.onQueryChange).toHaveBeenCalledWith('c');
  });

  it('shows a hint instead of results until three characters are typed', () => {
    renderPanel({ query: 'ce' });

    expect(screen.getByText('Type at least 3 characters')).toBeInTheDocument();
  });

  it('lists no rows until three characters are typed', () => {
    renderPanel({ query: 'ce' });

    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('counts surrounding whitespace out of the three characters', () => {
    renderPanel({ query: ' ce ' });

    expect(screen.getByText('Type at least 3 characters')).toBeInTheDocument();
  });

  it('shows a searching state while the query is in flight', () => {
    renderPanel({ isSearching: true, results: [] });

    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('shows the empty state when nothing matches', () => {
    renderPanel({ results: [] });

    expect(screen.getByText('No artists, releases or videos found.')).toBeInTheDocument();
  });

  it('shows an error state when the search fails', () => {
    renderPanel({ isError: true, results: [] });

    expect(screen.getByText('Search is unavailable right now.')).toBeInTheDocument();
  });

  it('lists each artist with a count of their matching releases', () => {
    renderPanel();

    expect(screen.getByRole('option', { name: 'Ceschi 2 releases' })).toBeInTheDocument();
  });

  it('uses the singular for a single release', () => {
    renderPanel();

    expect(screen.getByRole('option', { name: 'David Ramos 1 release' })).toBeInTheDocument();
  });

  it('omits the count for an artist matched without releases', () => {
    renderPanel({ results: [noReleases] });

    expect(screen.getByRole('option', { name: 'Sixo' })).toBeInTheDocument();
  });

  it('shows the artist thumbnail when there is one', () => {
    renderPanel();

    const row = screen.getByRole('option', { name: 'Ceschi 2 releases' });
    expect(row.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/ceschi.jpg');
  });

  it('shows a placeholder tile when the artist has no thumbnail', () => {
    renderPanel();

    const row = screen.getByRole('option', { name: 'David Ramos 1 release' });
    expect(row.querySelector('img')).toBeNull();
  });

  it('lists each matching release under its artist', () => {
    renderPanel();

    expect(screen.getByRole('option', { name: 'Broken Bone Ballads' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'That Down There' })).toBeInTheDocument();
  });

  it('shows the release cover art beside a release', () => {
    renderPanel();

    const row = screen.getByRole('option', { name: 'Broken Bone Ballads' });
    expect(row.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/bbb.jpg');
  });

  it('shows a placeholder tile when a release has no cover art', () => {
    renderPanel();

    const row = screen.getByRole('option', { name: 'Sad, Fat Luck' });
    expect(row.querySelector('img')).toBeNull();
    expect(row.querySelector('svg')).not.toBeNull();
  });

  it('hands the artist slug back when an artist row is picked', async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    await user.click(screen.getByRole('option', { name: 'Ceschi 2 releases' }));

    expect(props.onArtistSelect).toHaveBeenCalledWith('ceschi');
  });

  it('hands the artist and release back when a release row is picked', async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    await user.click(screen.getByRole('option', { name: 'Sad, Fat Luck' }));

    expect(vi.mocked(props.onReleaseSelect).mock.calls).toEqual([[ceschi, ceschi.releases[1]]]);
  });

  it('names the search field for artists, releases and videos', () => {
    renderPanel();

    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-label',
      'Search artists, releases and videos'
    );
  });

  it('counts an artist’s releases and videos on its row', () => {
    renderPanel({ results: [ash] });

    expect(
      screen.getByRole('option', { name: 'Marguerite Ash 1 release · 2 videos' })
    ).toBeInTheDocument();
  });

  it('counts only the videos of an artist without releases, singular for one', () => {
    renderPanel({ results: [videoOnly] });

    expect(screen.getByRole('option', { name: 'Sole 1 video' })).toBeInTheDocument();
  });

  it('heads an artist’s releases with "Releases" and its videos with "Videos"', () => {
    renderPanel({ results: [ash] });

    expect(screen.getByRole('group', { name: 'Releases' })).toContainElement(
      screen.getByRole('option', { name: 'Paper Moons' })
    );
    expect(screen.getByRole('group', { name: 'Videos' })).toContainElement(
      screen.getByRole('option', { name: 'Live at the Basement' })
    );
  });

  it('puts the artist row first, then its releases, then its videos', () => {
    renderPanel({ results: [ash] });

    const options = screen.getAllByRole('option').map(({ textContent }) => textContent);
    expect(options).toEqual([
      'Marguerite Ash1 release · 2 videos',
      'Paper Moons',
      'Live at the Basement',
      'Tour Diary',
    ]);
  });

  it('leaves out the "Videos" heading for an artist without videos', () => {
    renderPanel({ results: [ceschi] });

    expect(screen.getByRole('group', { name: 'Releases' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Videos' })).toBeNull();
  });

  it('leaves out the "Releases" heading for an artist without releases', () => {
    renderPanel({ results: [videoOnly] });

    expect(screen.queryByRole('group', { name: 'Releases' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Videos' })).toBeInTheDocument();
  });

  it('shows the row of an artist with neither releases nor videos, under no heading', () => {
    renderPanel({ results: [noReleases] });

    expect(screen.getByRole('option', { name: 'Sixo' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Releases' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Videos' })).toBeNull();
  });

  it('sets the headings in small semibold zinc, indented with their rows', () => {
    renderPanel({ results: [ash] });

    const group = screen.getByRole('group', { name: 'Videos' }).parentElement;
    expect(group).toHaveClass(
      '**:[[cmdk-group-heading]]:pl-6',
      '**:[[cmdk-group-heading]]:font-semibold',
      '**:[[cmdk-group-heading]]:text-zinc-600'
    );
    expect(screen.getByRole('option', { name: 'Live at the Basement' })).toHaveClass('pl-6');
  });

  it('leads a video row with its poster', () => {
    renderPanel({ results: [ash] });

    const poster = screen
      .getByRole('option', { name: 'Live at the Basement' })
      .querySelector('img');
    expect(poster).toHaveAttribute('src', 'https://cdn.example.com/media/videos/v-1/poster.jpg');
    expect(poster).toHaveAttribute('alt', '');
    expect(poster).toHaveClass('h-8', 'w-14', 'object-cover');
  });

  it('shows a film tile when a video has no poster', () => {
    renderPanel({ results: [ash] });

    const row = screen.getByRole('option', { name: 'Tour Diary' });
    expect(row.querySelector('img')).toBeNull();
    expect(row.querySelector('svg')).not.toBeNull();
  });

  it('hands the artist and video back when a video row is picked', async () => {
    const user = userEvent.setup();
    const { props } = renderPanel({ results: [ash] });

    await user.click(screen.getByRole('option', { name: 'Tour Diary' }));

    expect(vi.mocked(props.onVideoSelect).mock.calls).toEqual([[ash, ash.videos[1]]]);
  });
});
