/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

/**
 * Admin-reviewed artist name detail for a single artist parsed from the video
 * artist string. Caps on firstName/middleName/surname/displayName deliberately
 * mirror artistBaseSchema so the values drop cleanly into ArtistRepository.
 */
export const videoArtistDetailSchema = z.object({
  sourceName: z.string().trim().min(1).max(200),
  firstName: z.string().max(100).optional(),
  middleName: z.string().max(100).optional(),
  surname: z.string().max(100).optional(),
  displayName: z.string().max(200).optional(),
});

export type VideoArtistDetail = z.infer<typeof videoArtistDetailSchema>;
