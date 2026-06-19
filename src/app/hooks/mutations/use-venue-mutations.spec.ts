// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { createVenueAction, updateVenueAction } from '@/lib/actions/venue-actions';
import { queryKeys } from '@/lib/query-keys';
import type { FormState } from '@/lib/types/form-state';

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
  invalidateQueriesMock.mockClear();
});

describe('useCreateVenueMutation', () => {
  it('calls createVenueAction with the form state and data', async () => {
    vi.mocked(createVenueAction).mockResolvedValue(okState);
    const opts = getOptions<{ formState: FormState; formData: FormData }>(useCreateVenueMutation);
    const formData = new FormData();

    await opts.mutationFn({ formState: failState, formData });

    expect(createVenueAction).toHaveBeenCalledWith(failState, formData);
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
  it('calls updateVenueAction with the venue id, state, and data', async () => {
    vi.mocked(updateVenueAction).mockResolvedValue(okState);
    const opts = getOptions<{ venueId: string; formState: FormState; formData: FormData }>(
      useUpdateVenueMutation
    );
    const formData = new FormData();

    await opts.mutationFn({ venueId: 'v-1', formState: failState, formData });

    expect(updateVenueAction).toHaveBeenCalledWith('v-1', failState, formData);
  });

  it('invalidates the venue and tour caches on success', async () => {
    const opts = getOptions(useUpdateVenueMutation);

    await opts.onSuccess(okState, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.venues.all });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.tours.all });
  });
});
