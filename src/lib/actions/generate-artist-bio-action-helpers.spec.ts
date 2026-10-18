/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { revalidateArtistBioPaths } from './generate-artist-bio-action-helpers';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

describe('revalidateArtistBioPaths', () => {
  it("revalidates the admin and public artist lists and the artist's page", () => {
    revalidateArtistBioPaths('radiohead');

    expect(vi.mocked(revalidatePath).mock.calls).toEqual([
      ['/admin/artists'],
      ['/artists'],
      ['/artists/radiohead'],
    ]);
  });
});
