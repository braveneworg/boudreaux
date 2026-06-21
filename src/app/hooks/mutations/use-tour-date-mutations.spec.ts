// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import {
  createTourDateAction,
  deleteTourDateAction,
  removeHeadlinerAction,
  reorderHeadlinersAction,
  updateHeadlinerSetTimeAction,
  updateTourDateAction,
} from '@/lib/actions/tour-date-actions';
import { queryKeys } from '@/lib/query-keys';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import type {
  TourDateCreateInput,
  TourDateUpdateInput,
} from '@/lib/validation/tours/tour-date-schema';

import {
  useCreateTourDateMutation,
  useDeleteTourDateMutation,
  useRemoveHeadlinerMutation,
  useReorderHeadlinersMutation,
  useUpdateHeadlinerSetTimeMutation,
  useUpdateTourDateMutation,
} from './use-tour-date-mutations';

const useMutationMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('@/lib/actions/tour-date-actions', () => ({
  createTourDateAction: vi.fn(),
  updateTourDateAction: vi.fn(),
  deleteTourDateAction: vi.fn(),
  updateHeadlinerSetTimeAction: vi.fn(),
  removeHeadlinerAction: vi.fn(),
  reorderHeadlinersAction: vi.fn(),
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
  useMutationMock.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    data: undefined,
    reset: vi.fn(),
  });
});

const createInput: TourDateCreateInput = {
  tourId: 't1',
  startDate: new Date('2026-01-01'),
  showStartTime: new Date('2026-01-01T20:00'),
  venueId: 'v1',
  headlinerIds: ['a1'],
};

describe('useCreateTourDateMutation', () => {
  it('passes EMPTY_FORM_STATE as the first argument to createTourDateAction', async () => {
    vi.mocked(createTourDateAction).mockResolvedValue(okState);
    const opts = getOptions<TourDateCreateInput>(useCreateTourDateMutation);

    await opts.mutationFn(createInput);

    expect(createTourDateAction).toHaveBeenCalledWith(EMPTY_FORM_STATE, expect.any(FormData));
  });

  it('serializes venueId into the FormData', async () => {
    vi.mocked(createTourDateAction).mockResolvedValue(okState);
    const opts = getOptions<TourDateCreateInput>(useCreateTourDateMutation);

    await opts.mutationFn(createInput);

    const formData = vi.mocked(createTourDateAction).mock.calls.at(-1)?.[1] as FormData;
    expect(formData.get('venueId')).toBe('v1');
  });

  it('serializes headlinerIds as a JSON string in the FormData', async () => {
    vi.mocked(createTourDateAction).mockResolvedValue(okState);
    const opts = getOptions<TourDateCreateInput>(useCreateTourDateMutation);

    await opts.mutationFn(createInput);

    const formData = vi.mocked(createTourDateAction).mock.calls.at(-1)?.[1] as FormData;
    expect(formData.get('headlinerIds')).toBe('["a1"]');
  });

  it('invalidates the tour cache on success', async () => {
    const opts = getOptions<TourDateCreateInput>(useCreateTourDateMutation);

    await opts.onSuccess(okState, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.tours.all });
  });

  it('does not invalidate on failure', async () => {
    const opts = getOptions<TourDateCreateInput>(useCreateTourDateMutation);

    await opts.onSuccess(failState, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('useUpdateTourDateMutation', () => {
  it('calls updateTourDateAction with the tour date id as the first argument', async () => {
    vi.mocked(updateTourDateAction).mockResolvedValue(okState);
    const opts = getOptions<{ id: string; values: TourDateUpdateInput }>(useUpdateTourDateMutation);

    await opts.mutationFn({ id: 'td1', values: { venueId: 'v2' } });

    expect(updateTourDateAction).toHaveBeenCalledWith(
      'td1',
      EMPTY_FORM_STATE,
      expect.any(FormData)
    );
  });

  it('serializes the updated values into the FormData', async () => {
    vi.mocked(updateTourDateAction).mockResolvedValue(okState);
    const opts = getOptions<{ id: string; values: TourDateUpdateInput }>(useUpdateTourDateMutation);

    await opts.mutationFn({ id: 'td1', values: { venueId: 'v2' } });

    const formData = vi.mocked(updateTourDateAction).mock.calls.at(-1)?.[2] as FormData;
    expect(formData.get('venueId')).toBe('v2');
  });
});

describe('useDeleteTourDateMutation', () => {
  it('calls deleteTourDateAction and invalidates on success', async () => {
    vi.mocked(deleteTourDateAction).mockResolvedValue({ success: true });
    const opts = getOptions<{ tourDateId: string }>(useDeleteTourDateMutation);

    await opts.mutationFn({ tourDateId: 'td-1' });
    await opts.onSuccess({ success: true }, {});

    expect(deleteTourDateAction).toHaveBeenCalledWith('td-1');
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.tours.all });
  });
});

describe('useUpdateHeadlinerSetTimeMutation', () => {
  it('forwards all positional arguments to updateHeadlinerSetTimeAction', async () => {
    vi.mocked(updateHeadlinerSetTimeAction).mockResolvedValue({ success: true });
    const opts = getOptions<{
      headlinerId: string;
      setTime: string | null;
      tourDateId?: string;
      artistId?: string;
    }>(useUpdateHeadlinerSetTimeMutation);

    await opts.mutationFn({
      headlinerId: 'h-1',
      setTime: '2026-03-08T20:00:00.000Z',
      tourDateId: 'td-1',
      artistId: 'a-1',
    });

    expect(updateHeadlinerSetTimeAction).toHaveBeenCalledWith(
      'h-1',
      '2026-03-08T20:00:00.000Z',
      'td-1',
      'a-1'
    );
  });
});

describe('useRemoveHeadlinerMutation', () => {
  it('forwards all positional arguments to removeHeadlinerAction', async () => {
    vi.mocked(removeHeadlinerAction).mockResolvedValue({ success: true });
    const opts = getOptions<{ headlinerId: string; tourDateId?: string; artistId?: string }>(
      useRemoveHeadlinerMutation
    );

    await opts.mutationFn({ headlinerId: 'h-1', tourDateId: 'td-1', artistId: 'a-1' });

    expect(removeHeadlinerAction).toHaveBeenCalledWith('h-1', 'td-1', 'a-1');
  });
});

describe('useReorderHeadlinersMutation', () => {
  it('forwards the tour date id and ordered headliner ids', async () => {
    vi.mocked(reorderHeadlinersAction).mockResolvedValue({ success: true });
    const opts = getOptions<{ tourDateId: string; headlinerIds: string[] }>(
      useReorderHeadlinersMutation
    );

    await opts.mutationFn({ tourDateId: 'td-1', headlinerIds: ['h-2', 'h-1'] });
    await opts.onSuccess({ success: true }, {});

    expect(reorderHeadlinersAction).toHaveBeenCalledWith('td-1', ['h-2', 'h-1']);
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.tours.all });
  });
});
