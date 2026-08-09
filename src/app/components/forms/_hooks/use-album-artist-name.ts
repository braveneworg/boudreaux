/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';

import { useArtistsQuery } from './use-artists-query';

/**
 * Resolves the display name of a release's first credited artist.
 *
 * Only that one artist is fetched — the release-notes generator needs a single
 * name to anchor its prose, not the whole credit list. Returns null while the
 * fetch is pending, when no artist is credited yet, or when the id resolves to
 * nothing.
 *
 * @param artistIds - The form's currently watched `artistIds`.
 * @returns The album artist's display name, or null when unresolvable.
 */
export const useAlbumArtistName = (artistIds: string[] | undefined): string | null => {
  const firstArtistId = artistIds?.[0] ?? '';
  const { artistsById } = useArtistsQuery(firstArtistId ? [firstArtistId] : []);
  const firstArtist = Object.values(artistsById).at(0);

  return firstArtist ? getArtistDisplayName(firstArtist) : null;
};
