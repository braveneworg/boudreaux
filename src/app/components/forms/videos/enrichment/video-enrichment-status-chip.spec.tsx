/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';

import { VideoEnrichmentStatusChip } from './video-enrichment-status-chip';

describe('VideoEnrichmentStatusChip', () => {
  it('labels a never-enriched video', () => {
    render(<VideoEnrichmentStatusChip status={null} />);

    expect(screen.getByTestId('video-enrichment-status-chip')).toHaveTextContent('Not enriched');
  });

  it('labels a pending job as enriching', () => {
    render(<VideoEnrichmentStatusChip status="pending" />);

    expect(screen.getByTestId('video-enrichment-status-chip')).toHaveTextContent('Enriching…');
  });

  it('labels a processing job as enriching', () => {
    render(<VideoEnrichmentStatusChip status="processing" />);

    expect(screen.getByTestId('video-enrichment-status-chip')).toHaveTextContent('Enriching…');
  });

  it('labels a failed job', () => {
    render(<VideoEnrichmentStatusChip status="failed" />);

    expect(screen.getByTestId('video-enrichment-status-chip')).toHaveTextContent('Failed');
  });

  it('labels a succeeded job', () => {
    render(<VideoEnrichmentStatusChip status="succeeded" />);

    expect(screen.getByTestId('video-enrichment-status-chip')).toHaveTextContent('Enriched');
  });
});
