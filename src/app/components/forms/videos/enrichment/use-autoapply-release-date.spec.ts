// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from '@testing-library/react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type { VideoEnrichmentStatusResult } from '@/lib/validation/video-enrichment-schema';

import {
  findReleaseDateSuggestion,
  useAutoApplyReleaseDateSuggestion,
} from './use-autoapply-release-date';

vi.mock('server-only', () => ({}));

type EnrichmentSuggestion = VideoEnrichmentStatusResult['suggestions'][number];

const releaseDateSuggestion = (
  value: string,
  over: Partial<EnrichmentSuggestion> = {}
): EnrichmentSuggestion => ({
  id: 'sug-1',
  artistId: null,
  field: 'releasedOn',
  value,
  confidence: 'medium',
  sources: [],
  note: null,
  status: 'pending',
  ...over,
});

const renderHarness = (initial: EnrichmentSuggestion[], releasedOn = '2020-01-01') => {
  const onApply = vi.fn();
  let formRef: UseFormReturn<VideoFormData> | undefined;
  const { rerender } = renderHook(
    ({ suggestions }: { suggestions: EnrichmentSuggestion[] }) => {
      const form = useForm<VideoFormData>({
        defaultValues: { title: 't', artist: 'a', releasedOn },
      });
      formRef = form;
      useAutoApplyReleaseDateSuggestion({ suggestions, control: form.control, onApply });
    },
    { initialProps: { suggestions: initial } }
  );
  const getForm = (): UseFormReturn<VideoFormData> => {
    if (!formRef) throw new Error('form not rendered');
    return formRef;
  };
  return { onApply, rerender, getForm };
};

describe('findReleaseDateSuggestion', () => {
  it('finds the pending video-level release-date suggestion', () => {
    const suggestion = releaseDateSuggestion('2019-05-01');
    expect(findReleaseDateSuggestion([suggestion])).toBe(suggestion);
  });

  it('ignores per-artist and non-release-date suggestions', () => {
    expect(
      findReleaseDateSuggestion([
        releaseDateSuggestion('2019-05-01', { artistId: 'artist-1' }),
        releaseDateSuggestion('a description', { field: 'description' }),
      ])
    ).toBeUndefined();
  });
});

describe('useAutoApplyReleaseDateSuggestion', () => {
  it('auto-applies the release-date suggestion into an untouched field', async () => {
    const { onApply } = renderHarness([releaseDateSuggestion('2019-05-01')]);

    await act(async () => {});

    expect(onApply).toHaveBeenCalledWith('releasedOn', '2019-05-01');
  });

  it('does not auto-apply once the admin has edited the date', async () => {
    const { onApply, rerender, getForm } = renderHarness([]);

    await act(async () => {
      getForm().setValue('releasedOn', '2001-01-01', { shouldDirty: true });
    });
    await act(async () => {
      rerender({ suggestions: [releaseDateSuggestion('2019-05-01')] });
    });

    expect(onApply).not.toHaveBeenCalled();
  });

  it('auto-applies at most once for the same suggestion across refetches', async () => {
    const suggestion = releaseDateSuggestion('2019-05-01');
    const { onApply, rerender } = renderHarness([suggestion]);

    await act(async () => {});
    await act(async () => {
      rerender({ suggestions: [suggestion] });
    });

    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('ignores a dismissed release-date suggestion', async () => {
    const { onApply } = renderHarness([
      releaseDateSuggestion('2019-05-01', { status: 'dismissed' }),
    ]);

    await act(async () => {});

    expect(onApply).not.toHaveBeenCalled();
  });
});
