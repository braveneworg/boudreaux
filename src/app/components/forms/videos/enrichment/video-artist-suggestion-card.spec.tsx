/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { currentArtistFieldValue, VideoArtistSuggestionCard } from './video-artist-suggestion-card';

const artist = {
  artistId: 'a1',
  displayName: 'E2E Enrich Lead',
  role: 'PRIMARY' as const,
  current: {
    firstName: 'E2E',
    middleName: null,
    surname: 'Enrich Lead',
    akaNames: null,
    displayName: 'E2E Enrich Lead',
    bornOn: null,
  },
};

const makeSuggestion = (id: string, field: 'bornOn' | 'akaNames', value: string) => ({
  id,
  artistId: 'a1',
  field,
  value,
  confidence: 'high' as const,
  sources: [{ url: 'https://musicbrainz.org/artist/x' }],
  note: null,
  status: 'pending' as const,
});

const suggestions = [
  makeSuggestion('s1', 'bornOn', '1985-03-15'),
  makeSuggestion('s2', 'akaNames', 'E2E Alias'),
];

describe('currentArtistFieldValue', () => {
  it('reads bornOn from the current identity', () => {
    expect(currentArtistFieldValue({ ...artist.current, bornOn: '1980-01-01' }, 'bornOn')).toBe(
      '1980-01-01'
    );
  });

  it('reads surname from the current identity', () => {
    expect(currentArtistFieldValue(artist.current, 'surname')).toBe('Enrich Lead');
  });

  it('returns null for the video-level releasedOn field', () => {
    expect(currentArtistFieldValue(artist.current, 'releasedOn')).toBeNull();
  });
});

describe('VideoArtistSuggestionCard', () => {
  it('links the artist name to the admin artist edit page', () => {
    render(
      <VideoArtistSuggestionCard
        artist={artist}
        suggestions={suggestions}
        isBusy={false}
        onApplySuggestion={vi.fn().mockResolvedValue(true)}
        onDismissSuggestion={vi.fn()}
      />
    );

    expect(screen.getByRole('link', { name: 'E2E Enrich Lead' })).toHaveAttribute(
      'href',
      '/admin/artists/a1'
    );
  });

  it('renders one row per suggestion', () => {
    render(
      <VideoArtistSuggestionCard
        artist={artist}
        suggestions={suggestions}
        isBusy={false}
        onApplySuggestion={vi.fn().mockResolvedValue(true)}
        onDismissSuggestion={vi.fn()}
      />
    );

    expect(screen.getAllByRole('button', { name: /^Apply .* suggestion$/ })).toHaveLength(2);
  });

  it('applies a single suggestion with its current value for concurrency', async () => {
    const onApplySuggestion = vi.fn().mockResolvedValue(true);
    render(
      <VideoArtistSuggestionCard
        artist={artist}
        suggestions={suggestions}
        isBusy={false}
        onApplySuggestion={onApplySuggestion}
        onDismissSuggestion={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Apply Born on suggestion' }));

    expect(onApplySuggestion).toHaveBeenCalledWith(suggestions[0], null);
  });

  it('applies all pending suggestions sequentially', async () => {
    const onApplySuggestion = vi.fn().mockResolvedValue(true);
    render(
      <VideoArtistSuggestionCard
        artist={artist}
        suggestions={suggestions}
        isBusy={false}
        onApplySuggestion={onApplySuggestion}
        onDismissSuggestion={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Apply all' }));

    await waitFor(() => expect(onApplySuggestion).toHaveBeenCalledTimes(2));
  });

  it('stops Apply-all on the first failure', async () => {
    const onApplySuggestion = vi.fn().mockResolvedValue(false);
    render(
      <VideoArtistSuggestionCard
        artist={artist}
        suggestions={suggestions}
        isBusy={false}
        onApplySuggestion={onApplySuggestion}
        onDismissSuggestion={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Apply all' }));

    await waitFor(() => expect(onApplySuggestion).toHaveBeenCalledTimes(1));
  });

  it('skips non-pending suggestions in Apply-all', async () => {
    const onApplySuggestion = vi.fn().mockResolvedValue(true);
    render(
      <VideoArtistSuggestionCard
        artist={artist}
        suggestions={[{ ...suggestions[0], status: 'applied' as const }, suggestions[1]]}
        isBusy={false}
        onApplySuggestion={onApplySuggestion}
        onDismissSuggestion={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Apply all' }));

    await waitFor(() => expect(onApplySuggestion).toHaveBeenCalledTimes(1));
    expect(onApplySuggestion).toHaveBeenCalledWith(suggestions[1], null);
  });

  it('hides Apply-all when nothing is pending', () => {
    render(
      <VideoArtistSuggestionCard
        artist={artist}
        suggestions={[{ ...suggestions[0], status: 'applied' as const }]}
        isBusy={false}
        onApplySuggestion={vi.fn().mockResolvedValue(true)}
        onDismissSuggestion={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'Apply all' })).not.toBeInTheDocument();
  });

  it('forwards a dismissal to onDismissSuggestion', async () => {
    const onDismissSuggestion = vi.fn();
    render(
      <VideoArtistSuggestionCard
        artist={artist}
        suggestions={suggestions}
        isBusy={false}
        onApplySuggestion={vi.fn().mockResolvedValue(true)}
        onDismissSuggestion={onDismissSuggestion}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss AKA names suggestion' }));

    expect(onDismissSuggestion).toHaveBeenCalledWith(suggestions[1]);
  });
});
