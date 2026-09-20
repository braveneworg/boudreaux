/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Legacy full-bio route at `/artists/[slug]/bio`.
 *
 * The biography is no longer a page of its own — it sits on the artist page
 * below the player. This route stays only to keep old links and indexed URLs
 * working, permanently redirecting to `/artists/[slug]`.
 */

import { permanentRedirect } from 'next/navigation';

interface ArtistBioPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ArtistBioPage({ params }: ArtistBioPageProps) {
  const { slug } = await params;
  permanentRedirect(`/artists/${slug}`);
}
