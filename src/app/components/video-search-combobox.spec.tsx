/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createElement } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { VideoRow } from '@/lib/validation/video-schema';

import { VideoSearchCombobox } from './video-search-combobox';

// Render next/image as a plain <img> so boolean layout props do not warn and
// the poster thumbnail src can be asserted directly.
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => createElement('img', { src, alt }),
}));

const makeVideo = (overrides: Partial<VideoRow>): VideoRow => ({
  id: 'video-1',
  title: 'Live at the Basement',
  artist: 'The Band',
  category: 'MUSIC',
  description: null,
  releasedOn: new Date(2026, 0, 15),
  durationSeconds: 200,
  s3Key: 'videos/live.mp4',
  fileName: 'live.mp4',
  fileSize: null,
  mimeType: 'video/mp4',
  posterUrl: null,
  publishedAt: new Date(2026, 0, 16),
  archivedAt: null,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date(2026, 0, 15),
  updatedAt: new Date(2026, 0, 15),
  ...overrides,
});

const alpha = makeVideo({
  id: 'v-alpha',
  title: 'Alpha Session',
  artist: 'Artist One',
  posterUrl: 'https://cdn.example.com/alpha.jpg',
});
const bravo = makeVideo({ id: 'v-bravo', title: 'Bravo Live', artist: 'Artist Two' });

const baseProps = {
  search: '',
  onSearchChange: vi.fn(),
  results: [alpha, bravo],
  isFetching: false,
  onSelect: vi.fn(),
};

describe('VideoSearchCombobox', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders a labelled trigger showing the placeholder', () => {
    render(<VideoSearchCombobox {...baseProps} />);

    const trigger = screen.getByRole('button', { name: 'Search videos' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('Search by title or artist');
  });

  it('shows the active query on the trigger', () => {
    render(<VideoSearchCombobox {...baseProps} search="golf" />);

    expect(screen.getByRole('button', { name: 'Search videos' })).toHaveTextContent('golf');
  });

  it('lists the matching videos with their artists when opened', async () => {
    const user = userEvent.setup();
    render(<VideoSearchCombobox {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'Search videos' }));

    expect(await screen.findByText('Alpha Session')).toBeInTheDocument();
    expect(screen.getByText('Artist One')).toBeInTheDocument();
    expect(screen.getByText('Bravo Live')).toBeInTheDocument();
  });

  it('shows the poster thumbnail when the video has one', async () => {
    const user = userEvent.setup();
    render(<VideoSearchCombobox {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'Search videos' }));
    await screen.findByText('Alpha Session');

    const thumbs = document.querySelectorAll('[data-slot="command-item"] img');
    expect(thumbs).toHaveLength(1);
    expect(thumbs[0]).toHaveAttribute('src', 'https://cdn.example.com/alpha.jpg');
  });

  it('forwards typed input to onSearchChange', async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    render(<VideoSearchCombobox {...baseProps} onSearchChange={onSearchChange} />);

    await user.click(screen.getByRole('button', { name: 'Search videos' }));
    await user.type(screen.getByPlaceholderText('Search by title or artist'), 'a');

    expect(onSearchChange).toHaveBeenCalledWith('a');
  });

  it('fires onSelect with the picked video and closes', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<VideoSearchCombobox {...baseProps} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Search videos' }));
    await user.click(await screen.findByText('Bravo Live'));

    expect(onSelect).toHaveBeenCalledWith(bravo);
    expect(screen.getByRole('button', { name: 'Search videos' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('shows the no-match empty state for a query without results', async () => {
    const user = userEvent.setup();
    render(<VideoSearchCombobox {...baseProps} search="zzz" results={[]} />);

    await user.click(screen.getByRole('button', { name: 'Search videos' }));

    expect(await screen.findByText(/No videos match/)).toBeInTheDocument();
  });

  it('shows a searching state while the query is in flight', async () => {
    const user = userEvent.setup();
    render(<VideoSearchCombobox {...baseProps} search="zzz" results={[]} isFetching />);

    await user.click(screen.getByRole('button', { name: 'Search videos' }));

    expect(await screen.findByText('Searching…')).toBeInTheDocument();
  });
});
