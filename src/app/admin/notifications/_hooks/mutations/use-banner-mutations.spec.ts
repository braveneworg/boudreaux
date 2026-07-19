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
import { EMPTY_FORM_STATE, type FormState } from '@/lib/types/form-state';
import type { BannerNotificationFormData } from '@/lib/validation/banner-notification-schema';

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

describe('useUpsertBannerNotificationMutation', () => {
  it('calls the action with EMPTY_FORM_STATE as the first argument', async () => {
    vi.mocked(createOrUpdateBannerNotificationAction).mockResolvedValue(okState);
    const opts = getOptions<BannerNotificationFormData>(useUpsertBannerNotificationMutation);

    await opts.mutationFn({ slotNumber: 1, content: 'Hi' });

    expect(createOrUpdateBannerNotificationAction).toHaveBeenCalledWith(
      EMPTY_FORM_STATE,
      expect.any(FormData)
    );
  });

  it('serializes the slot number onto the FormData', async () => {
    vi.mocked(createOrUpdateBannerNotificationAction).mockResolvedValue(okState);
    const opts = getOptions<BannerNotificationFormData>(useUpsertBannerNotificationMutation);

    await opts.mutationFn({ slotNumber: 1, content: 'Hi' });

    const formData = vi.mocked(createOrUpdateBannerNotificationAction).mock.calls.at(-1)?.[1];
    expect(formData?.get('slotNumber')).toBe('1');
  });

  it('serializes the content onto the FormData', async () => {
    vi.mocked(createOrUpdateBannerNotificationAction).mockResolvedValue(okState);
    const opts = getOptions<BannerNotificationFormData>(useUpsertBannerNotificationMutation);

    await opts.mutationFn({ slotNumber: 1, content: 'Hi' });

    const formData = vi.mocked(createOrUpdateBannerNotificationAction).mock.calls.at(-1)?.[1];
    expect(formData?.get('content')).toBe('Hi');
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

    expect(deleteBannerNotificationAction).toHaveBeenCalledWith(2);
  });

  it('invalidates the banner cache on success', async () => {
    const opts = getOptions<{ slotNumber: number }>(useDeleteBannerNotificationMutation);

    await opts.onSuccess({ success: true }, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.banners.all });
  });
});

describe('useUpdateRotationIntervalMutation', () => {
  it('calls updateRotationIntervalAction with the interval', async () => {
    vi.mocked(updateRotationIntervalAction).mockResolvedValue({ success: true });
    const opts = getOptions<{ interval: number }>(useUpdateRotationIntervalMutation);

    await opts.mutationFn({ interval: 8 });

    expect(updateRotationIntervalAction).toHaveBeenCalledWith(8);
  });

  it('invalidates the banner cache on success', async () => {
    const opts = getOptions<{ interval: number }>(useUpdateRotationIntervalMutation);

    await opts.onSuccess({ success: true }, {});

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.banners.all });
  });
});
