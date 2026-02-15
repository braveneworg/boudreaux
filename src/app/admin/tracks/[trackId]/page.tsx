/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import TrackForm from '@/app/components/forms/track-form';

interface TrackDetailPageProps {
  params: Promise<{ trackId: string }>;
}

export default async function TrackDetailPage({ params }: TrackDetailPageProps) {
  const { trackId } = await params;
  return <TrackForm trackId={trackId} />;
}
