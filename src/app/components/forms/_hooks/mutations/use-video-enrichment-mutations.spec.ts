// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';
import { toast } from 'sonner';

import { applyVideoSuggestionAction } from '@/lib/actions/apply-video-suggestion-action';
import { runVideoEnrichmentAction } from '@/lib/actions/run-video-enrichment-action';
import { queryKeys } from '@/lib/query-keys';

import {
  useApplyVideoSuggestionMutation,
  useRunVideoEnrichmentMutation,
  type ApplyVideoSuggestionInput,
} from './use-video-enrichment-mutations';

const useMutationMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/actions/run-video-enrichment-action', () => ({
  runVideoEnrichmentAction: vi.fn(),
}));
vi.mock('@/lib/actions/apply-video-suggestion-action', () => ({
  applyVideoSuggestionAction: vi.fn(),
}));

interface MutationOptions<TVariables> {
  mutationFn: (variables: TVariables) => Promise<unknown>;
  onSuccess: (result: { success: boolean; error?: string }, variables: TVariables) => void;
}

const getOptions = <TVariables>(renderFn: () => unknown): MutationOptions<TVariables> => {
  renderHook(renderFn);
  return useMutationMock.mock.calls.at(-1)?.[0] as MutationOptions<TVariables>;
};

const applyInput: ApplyVideoSuggestionInput = {
  suggestionId: 's1',
  op: 'apply',
  expectedCurrent: null,
};
const dismissInput: ApplyVideoSuggestionInput = { suggestionId: 's1', op: 'dismiss' };

beforeEach(() => {
  useMutationMock.mockReset();
  invalidateQueriesMock.mockClear();
  useMutationMock.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  });
});

describe('useRunVideoEnrichmentMutation', () => {
  it('calls runVideoEnrichmentAction with the video id', async () => {
    vi.mocked(runVideoEnrichmentAction).mockResolvedValue({ success: true, status: 'pending' });
    const opts = getOptions<undefined>(() => useRunVideoEnrichmentMutation('v1'));

    await opts.mutationFn(undefined);

    expect(vi.mocked(runVideoEnrichmentAction)).toHaveBeenCalledWith('v1');
  });

  it('invalidates only the enrichment status query on success', async () => {
    const opts = getOptions<undefined>(() => useRunVideoEnrichmentMutation('v1'));

    opts.onSuccess({ success: true }, undefined);

    expect(invalidateQueriesMock.mock.calls).toEqual([
      [{ queryKey: queryKeys.videos.enrichment('v1') }],
    ]);
  });

  it('REGRESSION: never invalidates videos.detail (a refetch resets the mounted form)', () => {
    const opts = getOptions<undefined>(() => useRunVideoEnrichmentMutation('v1'));

    opts.onSuccess({ success: true }, undefined);

    expect(invalidateQueriesMock).not.toHaveBeenCalledWith({
      queryKey: queryKeys.videos.detail('v1'),
    });
  });

  it('never invalidates the videos.all umbrella key', () => {
    const opts = getOptions<undefined>(() => useRunVideoEnrichmentMutation('v1'));

    opts.onSuccess({ success: true }, undefined);

    expect(invalidateQueriesMock).not.toHaveBeenCalledWith({
      queryKey: queryKeys.videos.all,
    });
  });

  it('surfaces a failed result as an error toast', () => {
    const opts = getOptions<undefined>(() => useRunVideoEnrichmentMutation('v1'));

    opts.onSuccess({ success: false, error: 'Enrichment is busy' }, undefined);

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Enrichment is busy');
  });

  it('does not invalidate anything on a failed result', () => {
    const opts = getOptions<undefined>(() => useRunVideoEnrichmentMutation('v1'));

    opts.onSuccess({ success: false, error: 'Enrichment is busy' }, undefined);

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });

  it('falls back to a default message when a failed result has no error', () => {
    const opts = getOptions<undefined>(() => useRunVideoEnrichmentMutation('v1'));

    opts.onSuccess({ success: false }, undefined);

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to start enrichment');
  });
});

describe('useApplyVideoSuggestionMutation', () => {
  it('forwards the input to applyVideoSuggestionAction', async () => {
    vi.mocked(applyVideoSuggestionAction).mockResolvedValue({ success: true, op: 'apply' });
    const opts = getOptions<ApplyVideoSuggestionInput>(() => useApplyVideoSuggestionMutation('v1'));

    await opts.mutationFn(applyInput);

    expect(vi.mocked(applyVideoSuggestionAction)).toHaveBeenCalledWith(applyInput);
  });

  it('invalidates the enrichment key and artists.all when an apply succeeds', () => {
    const opts = getOptions<ApplyVideoSuggestionInput>(() => useApplyVideoSuggestionMutation('v1'));

    opts.onSuccess({ success: true }, applyInput);

    expect(invalidateQueriesMock.mock.calls).toEqual([
      [{ queryKey: queryKeys.videos.enrichment('v1') }],
      [{ queryKey: queryKeys.artists.all }],
    ]);
  });

  it('invalidates only the enrichment key when a dismiss succeeds', () => {
    const opts = getOptions<ApplyVideoSuggestionInput>(() => useApplyVideoSuggestionMutation('v1'));

    opts.onSuccess({ success: true }, dismissInput);

    expect(invalidateQueriesMock.mock.calls).toEqual([
      [{ queryKey: queryKeys.videos.enrichment('v1') }],
    ]);
  });

  it('REGRESSION: an apply never invalidates videos.detail (form-reset hazard)', () => {
    const opts = getOptions<ApplyVideoSuggestionInput>(() => useApplyVideoSuggestionMutation('v1'));

    opts.onSuccess({ success: true }, applyInput);

    expect(invalidateQueriesMock).not.toHaveBeenCalledWith({
      queryKey: queryKeys.videos.detail('v1'),
    });
  });

  it('an apply never invalidates the videos.all umbrella key', () => {
    const opts = getOptions<ApplyVideoSuggestionInput>(() => useApplyVideoSuggestionMutation('v1'));

    opts.onSuccess({ success: true }, applyInput);

    expect(invalidateQueriesMock).not.toHaveBeenCalledWith({
      queryKey: queryKeys.videos.all,
    });
  });

  it('surfaces a failed result as an error toast', () => {
    const opts = getOptions<ApplyVideoSuggestionInput>(() => useApplyVideoSuggestionMutation('v1'));

    opts.onSuccess({ success: false, error: 'Value changed since suggested' }, applyInput);

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Value changed since suggested');
  });

  it('does not invalidate anything on a failed result', () => {
    const opts = getOptions<ApplyVideoSuggestionInput>(() => useApplyVideoSuggestionMutation('v1'));

    opts.onSuccess({ success: false, error: 'Value changed since suggested' }, applyInput);

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });

  it('falls back to a default message when a failed result has no error', () => {
    const opts = getOptions<ApplyVideoSuggestionInput>(() => useApplyVideoSuggestionMutation('v1'));

    opts.onSuccess({ success: false }, dismissInput);

    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to update suggestion');
  });
});
