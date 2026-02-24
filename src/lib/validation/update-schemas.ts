/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createArtistSchema } from './create-artist-schema';
import { createFeaturedArtistSchema } from './create-featured-artist-schema';
import { createGroupSchema } from './create-group-schema';
import { releaseBaseSchema } from './create-release-schema';
import { createTrackSchema } from './create-track-schema';
import { notificationBannerBaseSchema } from './notification-banner-schema';

// Schemas without .refine() -- .partial() works directly
export const updateArtistSchema = createArtistSchema.partial();
export const updateTrackSchema = createTrackSchema.partial();
export const updateFeaturedArtistSchema = createFeaturedArtistSchema.partial();
export const updateGroupSchema = createGroupSchema.partial();

// Schemas with .refine() -- use the base schema (pre-refine) for partial updates
// This strips cross-field refinements, which is correct for partial updates
export const updateReleaseSchema = releaseBaseSchema.partial();
export const updateNotificationBannerSchema = notificationBannerBaseSchema.partial();
