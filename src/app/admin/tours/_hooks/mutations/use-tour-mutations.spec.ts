// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { createTourAction, deleteTourAction, updateTourAction } from '@/lib/actions/tour-actions';
import { queryKeys } from '@/lib/query-keys';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import type { TourCreateInput, TourUpdateInput } from '@/lib/validation/tours/tour-schema';

import {
  useCreateTourMutation,
  useDeleteTourMutation,
  useUpdateTourMutation,
} from './use-tour-mutations';

const useMutationMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('@/lib/actions/tour-actions', () => ({
  createTourAction: vi.fn(),
  updateTourAction: vi.fn(),
  deleteTourAction: vi.fn(),
}));

interface MutationOptions<TVariables> {
  mutationFn: (variables: TVariables) => Promise<unknown>;
  onSuccess: (result: { success: boolean }, variables: unknown) => Promise<unknown> | undefined;
}

const getOptions = <TVariables>(renderFn: () => unknown): MutationOptions<TVariables> => {
  renderHook(renderFn);
  return useMutationMock.mock.calls.at(-1)?.[0] as MutationOptions<TVariables>;
};

const okState: FormState = { fields: {}, success: true };
const failState: FormState = { fields: {}, success: false };

beforeEach(() => {
  useMutationMock.mockReset();
  useMutationMock.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    data: undefined,
    reset: vi.fn(),
  });
  invalidateQueriesMock.mockClear();
});

describe('useCreateTourMutation', () => {
  it('calls createTourAction with the shared empty form state', async () => {
    vi.mocked(createTourAction).mockResolvedValue(okState);
    const opts = getOptions<TourCreateInput>(useCreateTourMutation);

    await opts.mutationFn({ title: 'My Tour' });

    expect(vi.mocked(createTourAction).mock.calls.at(-1)?.[0]).toBe(EMPTY_FORM_STATE);
  });

  it('serializes the tour values into the submitted form data', async () => {
    vi.mocked(createTourAction).mockResolvedValue(okState);
    const opts = getOptions<TourCreateInput>(useCreateTourMutation);

    await opts.mutationFn({ title: 'My Tour' });

    expect(vi.mocked(createTourAction).mock.calls.at(-1)?.[1].get('title')).toBe('My Tour');
  });

  it('invalidates the tour cache on success', async () => {
    const opts = getOptions(useCreateTourMutation);

    await opts.onSuccess(okState, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.tours.all });
  });

  it('does not invalidate on failure', async () => {
    const opts = getOptions(useCreateTourMutation);

    await opts.onSuccess(failState, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('useUpdateTourMutation', () => {
  it('calls updateTourAction with the tour id and shared empty form state', async () => {
    vi.mocked(updateTourAction).mockResolvedValue(okState);
    const opts = getOptions<{ id: string; values: TourUpdateInput }>(useUpdateTourMutation);

    await opts.mutationFn({ id: 't-1', values: { title: 'Edited' } });

    expect(vi.mocked(updateTourAction).mock.calls.at(-1)?.[0]).toBe('t-1');
  });

  it('preserves empty strings so optional fields can be cleared', async () => {
    vi.mocked(updateTourAction).mockResolvedValue(okState);
    const opts = getOptions<{ id: string; values: TourUpdateInput }>(useUpdateTourMutation);

    await opts.mutationFn({ id: 't-1', values: { title: 'Edited', subtitle: '' } });

    expect(vi.mocked(updateTourAction).mock.calls.at(-1)?.[2].get('subtitle')).toBe('');
  });

  it('invalidates the tour cache on success', async () => {
    const opts = getOptions(useUpdateTourMutation);

    await opts.onSuccess(okState, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.tours.all });
  });
});

describe('useDeleteTourMutation', () => {
  it('calls deleteTourAction with the tour id', async () => {
    vi.mocked(deleteTourAction).mockResolvedValue({ success: true });
    const opts = getOptions<{ tourId: string }>(useDeleteTourMutation);

    await opts.mutationFn({ tourId: 't-1' });

    expect(deleteTourAction).toHaveBeenCalledWith('t-1');
  });

  it('invalidates the tour cache on success', async () => {
    const opts = getOptions(useDeleteTourMutation);

    await opts.onSuccess({ success: true }, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.tours.all });
  });

  it('does not invalidate on failure', async () => {
    const opts = getOptions(useDeleteTourMutation);

    await opts.onSuccess({ success: false }, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});
