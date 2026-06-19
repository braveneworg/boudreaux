// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { createTourAction, deleteTourAction, updateTourAction } from '@/lib/actions/tour-actions';
import { queryKeys } from '@/lib/query-keys';
import type { FormState } from '@/lib/types/form-state';

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
  invalidateQueriesMock.mockClear();
});

describe('useCreateTourMutation', () => {
  it('calls createTourAction with the form state and data', async () => {
    vi.mocked(createTourAction).mockResolvedValue(okState);
    const opts = getOptions<{ formState: FormState; formData: FormData }>(useCreateTourMutation);
    const formData = new FormData();

    await opts.mutationFn({ formState: failState, formData });

    expect(createTourAction).toHaveBeenCalledWith(failState, formData);
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
  it('calls updateTourAction with the tour id, state, and data', async () => {
    vi.mocked(updateTourAction).mockResolvedValue(okState);
    const opts = getOptions<{ tourId: string; formState: FormState; formData: FormData }>(
      useUpdateTourMutation
    );
    const formData = new FormData();

    await opts.mutationFn({ tourId: 't-1', formState: failState, formData });

    expect(updateTourAction).toHaveBeenCalledWith('t-1', failState, formData);
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
