/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';

import { VideoEnrichmentProgressTimeline } from './video-enrichment-progress-timeline';

describe('VideoEnrichmentProgressTimeline', () => {
  it('renders the static searching copy before any checkpoint arrives', () => {
    render(<VideoEnrichmentProgressTimeline progress={null} />);

    expect(screen.getByRole('status')).toHaveTextContent(/searching the web/i);
  });

  it('renders one row per enrichment stage once a checkpoint arrives', () => {
    render(
      <VideoEnrichmentProgressTimeline
        progress={{ stage: 'wikidata', at: '2026-07-11T00:00:00.000Z' }}
      />
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('marks the checkpoint stage as the active step', () => {
    render(
      <VideoEnrichmentProgressTimeline
        progress={{ stage: 'wikidata', at: '2026-07-11T00:00:00.000Z' }}
      />
    );

    expect(screen.getByText('Wikidata').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('marks earlier stages complete', () => {
    render(
      <VideoEnrichmentProgressTimeline
        progress={{ stage: 'wikidata', at: '2026-07-11T00:00:00.000Z' }}
      />
    );

    expect(screen.getByText('MusicBrainz').closest('li')).toHaveAttribute('data-state', 'complete');
  });

  it('marks later stages upcoming', () => {
    render(
      <VideoEnrichmentProgressTimeline
        progress={{ stage: 'wikidata', at: '2026-07-11T00:00:00.000Z' }}
      />
    );

    expect(screen.getByText('Finalizing').closest('li')).toHaveAttribute('data-state', 'upcoming');
  });

  it('renders the active stage counts inline', () => {
    render(
      <VideoEnrichmentProgressTimeline
        progress={{
          stage: 'musicbrainz',
          counts: { candidates: 3 },
          at: '2026-07-11T00:00:00.000Z',
        }}
      />
    );

    expect(screen.getByText(/MusicBrainz — 3 candidates/)).toBeInTheDocument();
  });

  it('omits the inline counts when the counts object is empty', () => {
    render(
      <VideoEnrichmentProgressTimeline
        progress={{
          stage: 'musicbrainz',
          counts: {},
          at: '2026-07-11T00:00:00.000Z',
        }}
      />
    );

    expect(screen.getByText('MusicBrainz').closest('li')).toHaveTextContent('MusicBrainz');
    expect(screen.queryByText(/MusicBrainz —/)).not.toBeInTheDocument();
  });

  it('never rewinds the highlight when a lower stage arrives late', () => {
    const { rerender } = render(
      <VideoEnrichmentProgressTimeline
        progress={{ stage: 'web-search', at: '2026-07-11T00:00:01.000Z' }}
      />
    );

    rerender(
      <VideoEnrichmentProgressTimeline
        progress={{ stage: 'musicbrainz', at: '2026-07-11T00:00:00.000Z' }}
      />
    );

    expect(screen.getByText('Web search').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('labels the list for assistive tech', () => {
    render(
      <VideoEnrichmentProgressTimeline
        progress={{ stage: 'adjudicating', at: '2026-07-11T00:00:00.000Z' }}
      />
    );

    expect(screen.getByRole('list', { name: 'Enrichment progress' })).toBeInTheDocument();
  });
});
