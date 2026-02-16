/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import ArtistForm from '@/app/components/forms/artist-form';

interface ArtistDetailPageProps {
  params: Promise<{ artistId: string }>;
}

export default async function ArtistDetailPage({ params }: ArtistDetailPageProps) {
  const { artistId } = await params;
  return <ArtistForm artistId={artistId} />;
}
