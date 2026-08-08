// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from '@testing-library/react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type { VideoEnrichmentStatusResult } from '@/lib/validation/video-enrichment-schema';

import {
  findAppliedDescriptionSuggestion,
  useAutofillAppliedDescription,
} from './use-autofill-applied-description';

vi.mock('server-only', () => ({}));

type EnrichmentSuggestion = VideoEnrichmentStatusResult['suggestions'][number];

const descriptionSuggestion = (
  value: string,
  over: Partial<EnrichmentSuggestion> = {}
): EnrichmentSuggestion => ({
  id: 'sug-desc-1',
  artistId: null,
  field: 'description',
  value,
  confidence: 'medium',
  sources: [],
  note: null,
  status: 'applied',
  ...over,
});

const renderHarness = (initial: EnrichmentSuggestion[], description = '') => {
  const onApply = vi.fn();
  let formRef: UseFormReturn<VideoFormData> | undefined;
  const { rerender } = renderHook(
    ({ suggestions }: { suggestions: EnrichmentSuggestion[] }) => {
      const form = useForm<VideoFormData>({
        defaultValues: { title: 't', artist: 'a', description },
      });
      formRef = form;
      useAutofillAppliedDescription({ suggestions, control: form.control, onApply });
    },
    { initialProps: { suggestions: initial } }
  );
  const getForm = (): UseFormReturn<VideoFormData> => {
    if (!formRef) throw new Error('form not rendered');
    return formRef;
  };
  return { onApply, rerender, getForm };
};

describe('findAppliedDescriptionSuggestion', () => {
  it('finds the applied video-level description suggestion', () => {
    const suggestion = descriptionSuggestion('Prose.');
    expect(findAppliedDescriptionSuggestion([suggestion])).toBe(suggestion);
  });

  it('ignores pending, dismissed, per-artist, and non-description rows', () => {
    expect(
      findAppliedDescriptionSuggestion([
        descriptionSuggestion('Prose.', { status: 'pending' }),
        descriptionSuggestion('Prose.', { status: 'dismissed' }),
        descriptionSuggestion('Prose.', { artistId: 'artist-1' }),
        descriptionSuggestion('2020-01-01', { field: 'releasedOn' }),
      ])
    ).toBeUndefined();
  });
});

describe('useAutofillAppliedDescription', () => {
  it('fills an untouched blank field with the auto-applied description', async () => {
    const { onApply } = renderHarness([descriptionSuggestion('Auto-applied prose.')]);

    await act(async () => {});

    expect(onApply).toHaveBeenCalledWith('description', 'Auto-applied prose.');
  });

  it('never fills over a description the form already holds', async () => {
    const { onApply } = renderHarness(
      [descriptionSuggestion('Auto-applied prose.')],
      'Loaded from the video row.'
    );

    await act(async () => {});

    expect(onApply).not.toHaveBeenCalled();
  });

  it('never refills a description the admin deliberately cleared', async () => {
    const { onApply, rerender, getForm } = renderHarness([], 'Loaded from the video row.');

    await act(async () => {
      getForm().setValue('description', '', { shouldDirty: true });
    });
    await act(async () => {
      rerender({ suggestions: [descriptionSuggestion('Auto-applied prose.')] });
    });

    expect(onApply).not.toHaveBeenCalled();
  });

  it('fills at most once for the same suggestion across refetches', async () => {
    const suggestion = descriptionSuggestion('Auto-applied prose.');
    const { onApply, rerender } = renderHarness([suggestion]);

    await act(async () => {});
    await act(async () => {
      rerender({ suggestions: [suggestion] });
    });

    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('ignores a pending description suggestion (review stays manual)', async () => {
    const { onApply } = renderHarness([
      descriptionSuggestion('Pending prose.', { status: 'pending' }),
    ]);

    await act(async () => {});

    expect(onApply).not.toHaveBeenCalled();
  });
});
