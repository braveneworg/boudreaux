/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @deprecated Transitional barrel. The media wire schemas were split into
 * per-entity modules under `@/lib/validation/media/*` (expand–contract). Import
 * from the specific module instead; this file is removed once every importer
 * has migrated.
 */
export {
  artistScalarSchema,
  formatSchema,
  platformSchema,
} from '@/lib/validation/media/shared-schema';
export { digitalFormatWithFilesSchema } from '@/lib/validation/media/digital-format-schema';
export {
  artistDetailSchema,
  artistSchema,
  artistWithPublishedReleasesSchema,
} from '@/lib/validation/media/artist-schema';
export {
  publishedReleaseDetailSchema,
  publishedReleaseListingSchema,
  releaseCarouselItemSchema,
  releaseListItemSchema,
  releaseSchema,
} from '@/lib/validation/media/release-schema';
export { featuredArtistSchema } from '@/lib/validation/media/featured-artist-schema';
