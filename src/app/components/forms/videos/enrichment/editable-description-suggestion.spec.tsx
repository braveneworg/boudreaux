// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { VideoEnrichmentStatusResult } from '@/lib/validation/video-enrichment-schema';

import { EditableDescriptionSuggestion } from './editable-description-suggestion';

type EnrichmentSuggestion = VideoEnrichmentStatusResult['suggestions'][number];

const descriptionSuggestion = (over: Partial<EnrichmentSuggestion> = {}): EnrichmentSuggestion => ({
  id: 's-desc',
  artistId: null,
  field: 'description',
  value: 'A studio performance.',
  confidence: 'medium',
  sources: [{ url: 'https://example.com/song' }],
  note: null,
  status: 'pending',
  ...over,
});

describe('EditableDescriptionSuggestion', () => {
  it('renders the suggested description in an editable textarea', () => {
    render(
      <EditableDescriptionSuggestion
        suggestion={descriptionSuggestion()}
        currentDescription=""
        isBusy={false}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByRole('textbox', { name: /description/i })).toHaveValue(
      'A studio performance.'
    );
  });

  it('applies the original suggested text when it is left unedited', async () => {
    const onApply = vi.fn();
    render(
      <EditableDescriptionSuggestion
        suggestion={descriptionSuggestion()}
        currentDescription=""
        isBusy={false}
        onApply={onApply}
        onDismiss={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /use this description/i }));

    expect(onApply).toHaveBeenCalledWith('A studio performance.');
  });

  it('applies the admin-edited text', async () => {
    const onApply = vi.fn();
    render(
      <EditableDescriptionSuggestion
        suggestion={descriptionSuggestion()}
        currentDescription=""
        isBusy={false}
        onApply={onApply}
        onDismiss={vi.fn()}
      />
    );

    const textarea = screen.getByRole('textbox', { name: /description/i });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'My edited take.');
    await userEvent.click(screen.getByRole('button', { name: /use this description/i }));

    expect(onApply).toHaveBeenCalledWith('My edited take.');
  });

  it('shows an applied state and hides the actions once the form holds the text', () => {
    render(
      <EditableDescriptionSuggestion
        suggestion={descriptionSuggestion()}
        currentDescription="A studio performance."
        isBusy={false}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText(/applied to the form/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /use this description/i })).not.toBeInTheDocument();
  });

  it('dismisses via the parent', async () => {
    const onDismiss = vi.fn();
    render(
      <EditableDescriptionSuggestion
        suggestion={descriptionSuggestion()}
        currentDescription=""
        isBusy={false}
        onApply={vi.fn()}
        onDismiss={onDismiss}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(onDismiss).toHaveBeenCalled();
  });
});
