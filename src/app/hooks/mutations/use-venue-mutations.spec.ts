// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { createVenueAction, updateVenueAction } from '@/lib/actions/venue-actions';
import { queryKeys } from '@/lib/query-keys';
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import type { VenueCreateInput, VenueUpdateInput } from '@/lib/validation/tours/venue-schema';

import { useCreateVenueMutation, useUpdateVenueMutation } from './use-venue-mutations';

const useMutationMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('@/lib/actions/venue-actions', () => ({
  createVenueAction: vi.fn(),
  updateVenueAction: vi.fn(),
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

describe('useCreateVenueMutation', () => {
  it('calls createVenueAction with the empty form state', async () => {
    vi.mocked(createVenueAction).mockResolvedValue(okState);
    const opts = getOptions<VenueCreateInput>(useCreateVenueMutation);

    await opts.mutationFn({ name: 'The Venue', city: 'NOLA' } as VenueCreateInput);

    expect(createVenueAction).toHaveBeenCalledWith(EMPTY_FORM_STATE, expect.any(FormData));
  });

  it('serializes the venue values to form data', async () => {
    vi.mocked(createVenueAction).mockResolvedValue(okState);
    const opts = getOptions<VenueCreateInput>(useCreateVenueMutation);

    await opts.mutationFn({ name: 'The Venue', city: 'NOLA' } as VenueCreateInput);

    expect(vi.mocked(createVenueAction).mock.calls[0]?.[1].get('name')).toBe('The Venue');
  });

  it('invalidates the venue and tour caches on success', async () => {
    const opts = getOptions(useCreateVenueMutation);

    await opts.onSuccess(okState, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.venues.all });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.tours.all });
  });

  it('does not invalidate on failure', async () => {
    const opts = getOptions(useCreateVenueMutation);

    await opts.onSuccess(failState, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('useUpdateVenueMutation', () => {
  it('calls updateVenueAction with the venue id', async () => {
    vi.mocked(updateVenueAction).mockResolvedValue(okState);
    const opts = getOptions<{ id: string; values: VenueUpdateInput }>(useUpdateVenueMutation);

    await opts.mutationFn({ id: 'v1', values: { name: 'New Name' } as VenueUpdateInput });

    expect(updateVenueAction).toHaveBeenCalledWith('v1', EMPTY_FORM_STATE, expect.any(FormData));
  });

  it('invalidates the venue and tour caches on success', async () => {
    const opts = getOptions(useUpdateVenueMutation);

    await opts.onSuccess(okState, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.venues.all });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.tours.all });
  });
});
