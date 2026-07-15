/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { VideoEnrichmentStatusResult } from '@/lib/validation/video-enrichment-schema';

import { SuggestionFieldRow, suggestionFieldLabel } from './suggestion-field-row';

type EnrichmentSuggestion = VideoEnrichmentStatusResult['suggestions'][number];

const pendingSuggestion: EnrichmentSuggestion = {
  id: 's1',
  artistId: 'a1',
  field: 'bornOn',
  value: '1985-03-15',
  confidence: 'high',
  sources: [{ url: 'https://musicbrainz.org/artist/x', label: 'MusicBrainz' }],
  note: 'Corroborated by Wikidata P569.',
  status: 'pending',
};

const renderRow = (
  overrides: Partial<EnrichmentSuggestion> = {},
  onApply = vi.fn(),
  onDismiss = vi.fn()
) =>
  render(
    <ul>
      <SuggestionFieldRow
        suggestion={{ ...pendingSuggestion, ...overrides }}
        currentValue={null}
        isBusy={false}
        onApply={onApply}
        onDismiss={onDismiss}
      />
    </ul>
  );

describe('suggestionFieldLabel', () => {
  it('maps bornOn to a human label', () => {
    expect(suggestionFieldLabel('bornOn')).toBe('Born on');
  });

  it('maps releasedOn to a human label', () => {
    expect(suggestionFieldLabel('releasedOn')).toBe('Release date');
  });

  it('falls back to the raw field name for an unmapped field', () => {
    // An out-of-map field (e.g. a future suggestion field) returns the raw name,
    // exercising the `?? field` fallback.
    const unknownField = 'nickname' as EnrichmentSuggestion['field'];
    expect(suggestionFieldLabel(unknownField)).toBe('nickname');
  });
});

describe('SuggestionFieldRow — confidence fallback', () => {
  it('labels an unrecognized confidence level as Low', () => {
    const unknownConfidence = 'unknown' as EnrichmentSuggestion['confidence'];
    renderRow({ confidence: unknownConfidence });

    expect(screen.getByText('Low')).toBeInTheDocument();
  });
});

describe('SuggestionFieldRow — pending', () => {
  it('renders the field label', () => {
    renderRow();

    expect(screen.getByText('Born on')).toBeInTheDocument();
  });

  it('renders a dash for an empty current value', () => {
    renderRow();

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders the suggested value', () => {
    renderRow();

    expect(screen.getByText('1985-03-15')).toBeInTheDocument();
  });

  it('renders the confidence as a text badge', () => {
    renderRow();

    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('renders each source as a safe external link', () => {
    renderRow();

    const link = screen.getByRole('link', { name: 'MusicBrainz' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('falls back to the source hostname when a source has no label', () => {
    renderRow({ sources: [{ url: 'https://musicbrainz.org/artist/x' }] });

    expect(screen.getByRole('link', { name: 'musicbrainz.org' })).toBeInTheDocument();
  });

  it('falls back to the raw url when a labelless source is not a valid URL', () => {
    renderRow({ sources: [{ url: 'not a url' }] });

    expect(screen.getByRole('link', { name: 'not a url' })).toBeInTheDocument();
  });

  it('renders no source list when the suggestion has no sources', () => {
    renderRow({ sources: [] });

    expect(
      screen.queryByRole('list', { name: 'Sources (each opens in a new tab)' })
    ).not.toBeInTheDocument();
  });

  it('exposes the note to screen readers only', () => {
    renderRow();

    expect(screen.getByText('Corroborated by Wikidata P569.')).toHaveClass('sr-only');
  });

  it('fires onApply when Apply is clicked', async () => {
    const onApply = vi.fn();
    renderRow({}, onApply);

    await userEvent.click(screen.getByRole('button', { name: 'Apply Born on suggestion' }));

    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss when Dismiss is clicked', async () => {
    const onDismiss = vi.fn();
    renderRow({}, vi.fn(), onDismiss);

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss Born on suggestion' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('disables the action buttons while busy', () => {
    render(
      <ul>
        <SuggestionFieldRow
          suggestion={pendingSuggestion}
          currentValue={null}
          isBusy
          onApply={vi.fn()}
          onDismiss={vi.fn()}
        />
      </ul>
    );

    expect(screen.getByRole('button', { name: 'Apply Born on suggestion' })).toBeDisabled();
  });
});

describe('SuggestionFieldRow — terminal states', () => {
  it('shows an Applied badge without action buttons once applied', () => {
    renderRow({ status: 'applied' });

    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('collapses a dismissed suggestion to a muted line', () => {
    renderRow({ status: 'dismissed' });

    expect(screen.getByText('Born on: Dismissed')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
