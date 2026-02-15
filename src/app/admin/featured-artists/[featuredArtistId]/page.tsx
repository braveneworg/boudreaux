/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import FeaturedArtistForm from '@/app/components/forms/featured-artist-form';

interface EditFeaturedArtistPageProps {
  params: Promise<{ featuredArtistId: string }>;
}

export default async function EditFeaturedArtistPage({ params }: EditFeaturedArtistPageProps) {
  const { featuredArtistId } = await params;
  return <FeaturedArtistForm featuredArtistId={featuredArtistId} />;
}
