/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { artistBaseSchema } from './create-artist-schema';
import { releaseBaseSchema } from './create-release-schema';
import { notificationBannerBaseSchema } from './notification-banner-schema';

// Schemas with .refine()/.superRefine() -- use the base schema (pre-refine) for partial updates
// This strips cross-field refinements, which is correct for partial updates
export const updateArtistSchema = artistBaseSchema.partial();
export const updateReleaseSchema = releaseBaseSchema.partial();
export const updateNotificationBannerSchema = notificationBannerBaseSchema.partial();
