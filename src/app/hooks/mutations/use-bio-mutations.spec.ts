// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';

import { generateArtistBioAction } from '@/lib/actions/generate-artist-bio-action';

import { useGenerateArtistBioMutation } from './use-bio-mutations';

const useMutationMock = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: unknown) => useMutationMock(options),
}));

vi.mock('@/lib/actions/generate-artist-bio-action', () => ({ generateArtistBioAction: vi.fn() }));

interface MutationOptions {
  mutationFn: (input: unknown) => Promise<unknown>;
}

const getOptions = (): MutationOptions => {
  renderHook(() => useGenerateArtistBioMutation());
  return useMutationMock.mock.calls.at(-1)?.[0] as MutationOptions;
};

beforeEach(() => {
  useMutationMock.mockReset();
});

describe('useGenerateArtistBioMutation', () => {
  it('triggers generateArtistBioAction with the input', async () => {
    vi.mocked(generateArtistBioAction).mockResolvedValue({ success: true, status: 'pending' });
    const opts = getOptions();

    await opts.mutationFn({ artistId: 'a-1', description: 'note' });

    expect(generateArtistBioAction).toHaveBeenCalledWith({ artistId: 'a-1', description: 'note' });
  });
});
