// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import {
  createOrUpdateBannerNotificationAction,
  deleteBannerNotificationAction,
  updateRotationIntervalAction,
} from '@/lib/actions/banner-notification-action';
import { queryKeys } from '@/lib/query-keys';
import type { FormState } from '@/lib/types/form-state';

import {
  useDeleteBannerNotificationMutation,
  useUpdateRotationIntervalMutation,
  useUpsertBannerNotificationMutation,
} from './use-banner-mutations';

const useMutationMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('@/lib/actions/banner-notification-action', () => ({
  createOrUpdateBannerNotificationAction: vi.fn(),
  deleteBannerNotificationAction: vi.fn(),
  updateRotationIntervalAction: vi.fn(),
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

describe('useUpsertBannerNotificationMutation', () => {
  it('calls createOrUpdateBannerNotificationAction with the form state and data', async () => {
    vi.mocked(createOrUpdateBannerNotificationAction).mockResolvedValue(okState);
    const opts = getOptions<{ formState: FormState; formData: FormData }>(
      useUpsertBannerNotificationMutation
    );
    const formData = new FormData();

    await opts.mutationFn({ formState: failState, formData });

    expect(createOrUpdateBannerNotificationAction).toHaveBeenCalledWith(failState, formData);
  });

  it('invalidates the banner cache on success', async () => {
    const opts = getOptions(useUpsertBannerNotificationMutation);

    await opts.onSuccess(okState, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.banners.all });
  });

  it('does not invalidate on failure', async () => {
    const opts = getOptions(useUpsertBannerNotificationMutation);

    await opts.onSuccess(failState, {});

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});

describe('useDeleteBannerNotificationMutation', () => {
  it('calls deleteBannerNotificationAction with the slot number', async () => {
    vi.mocked(deleteBannerNotificationAction).mockResolvedValue({ success: true });
    const opts = getOptions<{ slotNumber: number }>(useDeleteBannerNotificationMutation);

    await opts.mutationFn({ slotNumber: 2 });
    await opts.onSuccess({ success: true }, {});

    expect(deleteBannerNotificationAction).toHaveBeenCalledWith(2);
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.banners.all });
  });
});

describe('useUpdateRotationIntervalMutation', () => {
  it('calls updateRotationIntervalAction with the interval', async () => {
    vi.mocked(updateRotationIntervalAction).mockResolvedValue({ success: true });
    const opts = getOptions<{ interval: number }>(useUpdateRotationIntervalMutation);

    await opts.mutationFn({ interval: 8 });
    await opts.onSuccess({ success: true }, {});

    expect(updateRotationIntervalAction).toHaveBeenCalledWith(8);
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.banners.all });
  });
});
