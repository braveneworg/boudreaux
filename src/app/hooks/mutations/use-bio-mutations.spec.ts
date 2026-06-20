// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { generateArtistBioAction } from '@/lib/actions/generate-artist-bio-action';
import { queryKeys } from '@/lib/query-keys';
import type { GenerateArtistBioActionResult } from '@/lib/validation/bio-generation-schema';

import { useGenerateArtistBioMutation } from './use-bio-mutations';

const useMutationMock = vi.hoisted(() => vi.fn());
const invalidateQueriesMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => useMutationMock(options),
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('@/lib/actions/generate-artist-bio-action', () => ({ generateArtistBioAction: vi.fn() }));

interface MutationOptions {
  mutationFn: (input: unknown) => Promise<unknown>;
  onSuccess: (result: GenerateArtistBioActionResult) => Promise<unknown> | undefined;
}

const getOptions = (): MutationOptions => {
  renderHook(() => useGenerateArtistBioMutation());
  return useMutationMock.mock.calls.at(-1)?.[0] as MutationOptions;
};

const okResult = {
  success: true,
  data: { shortBio: 's', bio: '<p>b</p>', genres: null, images: [], links: [] },
} as unknown as GenerateArtistBioActionResult;
const failResult: GenerateArtistBioActionResult = { success: false, error: 'nope' };

beforeEach(() => {
  useMutationMock.mockReset();
  invalidateQueriesMock.mockClear();
});

describe('useGenerateArtistBioMutation', () => {
  it('calls generateArtistBioAction with the input', async () => {
    vi.mocked(generateArtistBioAction).mockResolvedValue(okResult);
    const opts = getOptions();

    await opts.mutationFn({ artistId: 'a-1', description: 'note' });

    expect(generateArtistBioAction).toHaveBeenCalledWith({ artistId: 'a-1', description: 'note' });
  });

  it('invalidates the artist caches on success', async () => {
    const opts = getOptions();

    await opts.onSuccess(okResult);

    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: queryKeys.artists.all });
  });

  it('does not invalidate when the action reports failure', async () => {
    const opts = getOptions();

    await opts.onSuccess(failResult);

    expect(invalidateQueriesMock).not.toHaveBeenCalled();
  });
});
