/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { VideoEnrichmentStatusResult } from '@/lib/validation/video-enrichment-schema';

import { VideoFieldSuggestion } from './video-field-suggestion';

type EnrichmentSuggestion = VideoEnrichmentStatusResult['suggestions'][number];

const suggestion: EnrichmentSuggestion = {
  id: 's3',
  artistId: null,
  field: 'releasedOn',
  value: '2020-06-01',
  confidence: 'medium',
  sources: [{ url: 'https://musicbrainz.org/release/y', label: 'MusicBrainz' }],
  note: null,
  status: 'pending',
};

interface HarnessProps {
  isAppliedToForm?: boolean;
  currentValue?: string | null;
  onApply?: () => void;
  onDismiss?: () => void;
}

const Harness = ({
  isAppliedToForm = false,
  currentValue = '2026-02-01',
  onApply = vi.fn(),
  onDismiss = vi.fn(),
}: HarnessProps) => (
  <VideoFieldSuggestion
    suggestion={suggestion}
    currentValue={currentValue}
    isAppliedToForm={isAppliedToForm}
    applyLabel="Use this date"
    testId="video-release-date-suggestion"
    onApply={onApply}
    onDismiss={onDismiss}
    isBusy={false}
  />
);

describe('VideoFieldSuggestion', () => {
  it('renders inside the given testid container', () => {
    render(<Harness />);

    expect(screen.getByTestId('video-release-date-suggestion')).toBeInTheDocument();
  });

  it('renders the suggested value', () => {
    render(<Harness />);

    expect(screen.getByText('2020-06-01')).toBeInTheDocument();
  });

  it('renders the current value beside the suggestion', () => {
    render(<Harness currentValue="2026-02-01" />);

    expect(screen.getByText(/Current: 2026-02-01/)).toBeInTheDocument();
  });

  it('shows a dash when the current value is null', () => {
    render(<Harness currentValue={null} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('labels the apply button with the given applyLabel', () => {
    render(<Harness />);

    expect(screen.getByRole('button', { name: /Apply/ })).toHaveTextContent('Use this date');
  });

  it('fires onApply when the apply button is clicked', async () => {
    const onApply = vi.fn();
    render(<Harness onApply={onApply} />);

    await userEvent.click(screen.getByRole('button', { name: /Apply/ }));

    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('fires onDismiss when the dismiss button is clicked', async () => {
    const onDismiss = vi.fn();
    render(<Harness onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('button', { name: /Dismiss/ }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('marks the row applied when isAppliedToForm is true', () => {
    render(<Harness isAppliedToForm />);

    expect(screen.getByText('Applied')).toBeInTheDocument();
  });

  it('shows the save-to-persist status line when applied', () => {
    render(<Harness isAppliedToForm />);

    expect(screen.getByRole('status')).toHaveTextContent('Applied to the form — Save to persist.');
  });

  it('hides the save-to-persist status line when not applied', () => {
    render(<Harness />);

    expect(screen.queryByText(/Save to persist/)).not.toBeInTheDocument();
  });
});
