/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { VideoEnrichmentStatusResult } from '@/lib/validation/video-enrichment-schema';

import { VideoDescriptionSuggestion } from './video-description-suggestion';

type EnrichmentSuggestion = VideoEnrichmentStatusResult['suggestions'][number];

const descriptionSuggestion = (over: Partial<EnrichmentSuggestion> = {}): EnrichmentSuggestion => ({
  id: 's-desc',
  artistId: null,
  field: 'description',
  value: 'A studio performance.',
  confidence: 'medium',
  sources: [{ url: 'https://example.com/song', label: 'Example' }],
  note: null,
  status: 'pending',
  ...over,
});

const renderRow = (
  over: Partial<EnrichmentSuggestion> = {},
  props: { isApplied?: boolean; isBusy?: boolean; onApply?: () => void } = {}
) =>
  render(
    <VideoDescriptionSuggestion
      suggestion={descriptionSuggestion(over)}
      isApplied={props.isApplied ?? false}
      isBusy={props.isBusy ?? false}
      onApply={props.onApply ?? vi.fn()}
    />
  );

describe('VideoDescriptionSuggestion', () => {
  it('renders the prose read-only with its confidence and sources', () => {
    renderRow();

    const card = screen.getByTestId('video-description-suggestion');
    expect(card).toHaveTextContent('A studio performance.');
    expect(card).toHaveTextContent('Medium');
    expect(screen.getByRole('link', { name: 'Example' })).toHaveAttribute(
      'href',
      'https://example.com/song'
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('applies through the parent on Use this description', async () => {
    const onApply = vi.fn();
    renderRow({}, { onApply });

    await userEvent.click(screen.getByRole('button', { name: 'Use this description' }));

    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('shows Applied and hides the button once the form holds the prose', () => {
    renderRow({}, { isApplied: true });

    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText(/applied to the form/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use this description' })).not.toBeInTheDocument();
  });

  it('disables the button while a mutation is in flight', () => {
    renderRow({}, { isBusy: true });

    expect(screen.getByRole('button', { name: 'Use this description' })).toBeDisabled();
  });

  it('offers no Dismiss control — description rows are applied or ignored', () => {
    renderRow();

    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it('renders nothing for a dismissed (legacy) row', () => {
    const { container } = renderRow({ status: 'dismissed' });

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an applied row — the editor already holds its prose', () => {
    const { container } = renderRow({ status: 'applied' });

    expect(container).toBeEmptyDOMElement();
  });
});
