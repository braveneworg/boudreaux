/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ArtistWithPublishedReleases } from '@/lib/types/media-models';

import { BioHtml } from './bio-html';
import { ExpandableThumbnail } from './expandable-thumbnail';

interface ArtistFullBioProps {
  displayName: string;
  bioImages: ArtistWithPublishedReleases['bioImages'];
  bio: string | null;
}

/**
 * The long-form half of the artist page: an expandable-thumbnail gallery,
 * then the sanitized long bio.
 *
 * This used to be a page of its own at `/artists/[slug]/bio`; it now sits
 * below the player on the artist page itself, so a reader never has to
 * navigate a second time to read the biography.
 *
 * @param displayName - The artist's display name, used for image alt text.
 * @param bioImages - The gallery's images, in pool order. The caller passes
 *   only what the page header is not already showing, so nothing appears twice.
 * @param bio - Sanitized long-bio HTML, or `null` when none is written yet.
 */
export const ArtistFullBio = ({ displayName, bioImages, bio }: ArtistFullBioProps) => (
  <section data-slot="artist-full-bio" className="space-y-6">
    <h2 className="text-xl font-semibold text-zinc-950">Biography</h2>

    {bioImages.length > 0 && (
      <ul
        aria-label="Artist images"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      >
        {bioImages.map((image) => (
          <li key={image.id} className="aspect-square">
            <ExpandableThumbnail
              src={image.url}
              thumbnailSrc={image.thumbnailUrl}
              alt={image.alt ?? image.title ?? `${displayName} image`}
              caption={image.title}
              attribution={image.attribution}
              license={image.license}
              sourceUrl={image.sourceUrl}
              className="size-full"
            />
          </li>
        ))}
      </ul>
    )}

    {bio ? (
      <article className="max-w-none [&_h2]:mt-10 [&_h2]:border-t [&_h2]:pt-6 [&_h3]:mt-6">
        {/* The bio HTML is sanitized server-side on read (sanitizeBioHtml) and
            again at generation time; BioHtml maps its <a>/<img> tags to Next
            Link/Image instead of dangerouslySetInnerHTML. Links are woven
            inline in the prose, so there is no separate link list. Section
            <h2>s get top spacing + a rule to visually separate sections. */}
        <BioHtml html={bio} />
      </article>
    ) : (
      <p className="text-zinc-600">No biography has been written for this artist yet.</p>
    )}
  </section>
);
