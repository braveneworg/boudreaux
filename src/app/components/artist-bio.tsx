/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { JSX } from 'react';

import { BIO_PROSE_CLASS, BioHtml } from './bio-html';

interface ArtistBioProps {
  /** The sanitized long bio HTML, or nothing when none has been written. */
  html: string | null;
  className?: string;
}

const HEADING_ID = 'artist-bio-heading';

/**
 * The biography on the artist page: an article named by its "Biography"
 * heading, the prose in the treatment the editor preview shares. Renders on
 * the server (no hooks); the page is the only place a bio is shown.
 */
export const ArtistBio = ({ html, className }: ArtistBioProps): JSX.Element => (
  <article aria-labelledby={HEADING_ID} className={className}>
    <h2 id={HEADING_ID} className="mb-4 text-2xl font-semibold">
      Biography
    </h2>
    {html ? (
      <BioHtml html={html} className={BIO_PROSE_CLASS} />
    ) : (
      <p className="text-zinc-600">No biography yet.</p>
    )}
  </article>
);
