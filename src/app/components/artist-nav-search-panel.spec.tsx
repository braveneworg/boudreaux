/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ArtistNavSearchPanel, type ArtistNavSearchPanelProps } from './artist-nav-search-panel';

// Render next/image as a plain <img> so the thumbnail src can be asserted.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => createElement('img', { src, alt }),
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

const renderPanel = (overrides: Partial<ArtistNavSearchPanelProps> = {}) => {
  const props: ArtistNavSearchPanelProps = {
    query: 'ces',
    onQueryChange: vi.fn(),
    isSearching: false,
    isError: false,
    results: [ceschi, ramos],
    onArtistSelect: vi.fn(),
    onReleaseSelect: vi.fn(),
    ...overrides,
  };
  return { ...render(<ArtistNavSearchPanel {...props} />), props };
};

describe('ArtistNavSearchPanel', () => {
  it('keeps its field at 16px on small screens, so iOS Safari does not zoom the page on focus', () => {
    renderPanel();

    const field = screen.getByPlaceholderText('Search artists & releases');
    expect(field).toHaveClass('text-base', 'md:text-sm');
    expect(field).not.toHaveClass('text-sm');
  });

  it('focuses its search field on mount, since it lands in an already-open popover', () => {
    renderPanel();

    expect(screen.getByPlaceholderText('Search artists & releases')).toHaveFocus();
  });

  it('forwards typed input to onQueryChange', async () => {
    const user = userEvent.setup();
    const { props } = renderPanel({ query: '' });

    await user.type(screen.getByPlaceholderText('Search artists & releases'), 'c');

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

    expect(screen.getByText('No artists or releases found.')).toBeInTheDocument();
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

  it('hands the artist slug and release id back when a release row is picked', async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    await user.click(screen.getByRole('option', { name: 'Sad, Fat Luck' }));

    expect(props.onReleaseSelect).toHaveBeenCalledWith('ceschi', 'r-2');
  });
});
