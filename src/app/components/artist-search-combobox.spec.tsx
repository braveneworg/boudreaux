/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ArtistListingRow } from '@/lib/types/domain/artist';

import { ArtistSearchCombobox } from './artist-search-combobox';

// Render next/image as a plain <img> so boolean layout props do not warn and
// the thumbnail src can be asserted directly.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => createElement('img', { src, alt }),
}));

const makeArtist = (overrides: Partial<ArtistListingRow>): ArtistListingRow => ({
  id: 'artist-1',
  slug: 'artist-one',
  firstName: 'Artist',
  middleName: null,
  surname: 'One',
  title: null,
  suffix: null,
  displayName: 'Artist One',
  akaNames: null,
  genres: null,
  instruments: null,
  shortBio: null,
  bornOn: null,
  diedOn: null,
  formedOn: null,
  bioImages: [],
  members: [],
  memberOf: [],
  releaseCount: 1,
  newestRelease: { id: 'r-1', title: 'Debut LP', releasedOn: new Date(2024, 0, 1) },
  ...overrides,
});

const alpha = makeArtist({
  id: 'a-alpha',
  displayName: 'Alpha Act',
  bioImages: [
    {
      id: 'img-1',
      url: 'https://cdn.example.com/alpha.jpg',
      thumbnailUrl: 'https://cdn.example.com/alpha-thumb.jpg',
      title: null,
      attribution: null,
      license: null,
      licenseUrl: null,
      sourceUrl: null,
      alt: null,
      isPrimary: false,
      displayOrder: null,
    },
  ],
  newestRelease: { id: 'r-a', title: 'Alpha Sessions', releasedOn: new Date(2025, 0, 1) },
});
const bravo = makeArtist({
  id: 'a-bravo',
  displayName: null,
  firstName: 'Bravo',
  surname: 'Band',
  newestRelease: null,
});

const baseProps = {
  search: '',
  onSearchChange: vi.fn(),
  results: [alpha, bravo],
  isFetching: false,
  onSelect: vi.fn(),
};

describe('ArtistSearchCombobox', () => {
  it('shows the placeholder in the same ink as a typed query, matching the releases search', () => {
    render(<ArtistSearchCombobox {...baseProps} search="" />);

    const trigger = screen.getByRole('button', { name: 'Search artists' });
    expect(trigger).toHaveClass('text-zinc-950');
    expect(trigger).not.toHaveClass('text-zinc-500');
  });

  it('draws the search icon in bold black ink', () => {
    const { container } = render(<ArtistSearchCombobox {...baseProps} />);

    const icon = container.querySelector('button[aria-label="Search artists"] svg');
    expect(icon).toHaveClass('text-black');
    expect(icon).toHaveAttribute('stroke-width', '2.5');
  });

  it('wears the punk-zine box: hard black border and ink offset, like the sort toggle', () => {
    render(<ArtistSearchCombobox {...baseProps} />);

    const trigger = screen.getByRole('button', { name: 'Search artists' });
    expect(trigger).toHaveClass('border-2', 'border-black', 'shadow-zine-ink', 'bg-zinc-50');
    expect(trigger).not.toHaveClass('border-zinc-950');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders a labelled trigger showing the placeholder', () => {
    render(<ArtistSearchCombobox {...baseProps} />);

    const trigger = screen.getByRole('button', { name: 'Search artists' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('Search by name, genre, or release');
  });

  it('shows the active query on the trigger', () => {
    render(<ArtistSearchCombobox {...baseProps} search="punk" />);

    expect(screen.getByRole('button', { name: 'Search artists' })).toHaveTextContent('punk');
  });

  it('uses the hot-pink accent ring of the artists section', () => {
    render(<ArtistSearchCombobox {...baseProps} />);

    expect(screen.getByRole('button', { name: 'Search artists' })).toHaveClass(
      'focus-visible:ring-menu-item-pink-400',
      'data-[state=open]:ring-menu-item-pink-400'
    );
  });

  it('lists the matching artists with their newest release when opened', async () => {
    const user = userEvent.setup();
    render(<ArtistSearchCombobox {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'Search artists' }));

    expect(await screen.findByText('Alpha Act')).toBeInTheDocument();
    expect(screen.getByText('Alpha Sessions')).toBeInTheDocument();
  });

  it('derives the name from the name parts when there is no display name', async () => {
    const user = userEvent.setup();
    render(<ArtistSearchCombobox {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'Search artists' }));

    expect(await screen.findByText('Bravo Band')).toBeInTheDocument();
  });

  it('prefers the bio-image thumbnail for the row image', async () => {
    const user = userEvent.setup();
    render(<ArtistSearchCombobox {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'Search artists' }));
    await screen.findByText('Alpha Act');

    const thumbs = document.querySelectorAll('[data-slot="command-item"] img');
    expect(thumbs).toHaveLength(1);
    expect(thumbs[0]).toHaveAttribute('src', 'https://cdn.example.com/alpha-thumb.jpg');
  });

  it('falls back to the full image when the bio image has no thumbnail', async () => {
    const user = userEvent.setup();
    const noThumb = makeArtist({
      id: 'a-full',
      displayName: 'Full Only',
      bioImages: [{ ...alpha.bioImages[0], id: 'img-2', thumbnailUrl: null }],
    });
    render(<ArtistSearchCombobox {...baseProps} results={[noThumb]} />);

    await user.click(screen.getByRole('button', { name: 'Search artists' }));
    await screen.findByText('Full Only');

    expect(document.querySelector('[data-slot="command-item"] img')).toHaveAttribute(
      'src',
      'https://cdn.example.com/alpha.jpg'
    );
  });

  it('forwards typed input to onSearchChange', async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    render(<ArtistSearchCombobox {...baseProps} onSearchChange={onSearchChange} />);

    await user.click(screen.getByRole('button', { name: 'Search artists' }));
    await user.type(screen.getByPlaceholderText('Search by name, genre, or release'), 'a');

    expect(onSearchChange).toHaveBeenCalledWith('a');
  });

  it('fires onSelect with the picked artist and closes', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ArtistSearchCombobox {...baseProps} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Search artists' }));
    await user.click(await screen.findByText('Alpha Act'));

    expect(onSelect).toHaveBeenCalledWith(alpha);
    expect(screen.getByRole('button', { name: 'Search artists' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('shows the no-match empty state for a query without results', async () => {
    const user = userEvent.setup();
    render(<ArtistSearchCombobox {...baseProps} search="zzz" results={[]} />);

    await user.click(screen.getByRole('button', { name: 'Search artists' }));

    expect(await screen.findByText('No artists match “zzz”.')).toBeInTheDocument();
  });

  it('shows the no-artists empty state when there is no query and no results', async () => {
    const user = userEvent.setup();
    render(<ArtistSearchCombobox {...baseProps} results={[]} />);

    await user.click(screen.getByRole('button', { name: 'Search artists' }));

    expect(await screen.findByText('No artists yet.')).toBeInTheDocument();
  });

  it('shows a searching state while the query is in flight', async () => {
    const user = userEvent.setup();
    render(<ArtistSearchCombobox {...baseProps} search="zzz" results={[]} isFetching />);

    await user.click(screen.getByRole('button', { name: 'Search artists' }));

    expect(await screen.findByText('Searching…')).toBeInTheDocument();
  });
});
