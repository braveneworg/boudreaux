/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { redirect } from 'next/navigation';

import { ArtistForm } from '@/app/components/forms/artist-form';

interface NewArtistPageProps {
  searchParams: Promise<{ releaseId?: string; returnTo?: string }>;
}

/**
 * Artists are created only in the context of a release. This route is reachable
 * solely from the release form's artist picker, which supplies `releaseId` and a
 * `returnTo` URL. Without that context the route redirects back to the artist
 * list, so there is no standalone "create artist" entry point.
 */
export default async function NewArtistPage({ searchParams }: NewArtistPageProps) {
  const { releaseId, returnTo } = await searchParams;

  if (!releaseId && !returnTo) {
    redirect('/admin/artists');
  }

  return <ArtistForm returnTo={returnTo} />;
}
