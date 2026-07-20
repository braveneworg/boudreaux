/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { ArtistService } from '@/lib/services/artist-service';
import type { ServiceResponse } from '@/lib/services/service.types';
import type { Artist, CreateArtistData } from '@/lib/types/domain/artist';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';

export const createArtistAction = async (artist: Artist): Promise<ServiceResponse<Artist>> => {
  try {
    await requireRole('admin');

    const { images, urls, labels: _labels, releases: _releases, ...scalars } = artist;

    // The repository owns the nested connectOrCreate translation; the action
    // forwards plain image/url inputs alongside the writable scalar fields.
    const data: CreateArtistData = {
      ...scalars,
      images: images.map(({ id, src, altText, caption }) => ({
        id,
        src: src ?? '',
        altText,
        caption,
      })),
      urls: urls.map(({ id, platform, url }) => ({ id, platform, url })),
    };

    return await ArtistService.createArtist(data);
  } catch (error) {
    loggers.media.error('Error creating artist', error);
    return { success: false, error: 'Failed to create artist', code: 'UNKNOWN' };
  }
};
