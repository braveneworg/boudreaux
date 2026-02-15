/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import ReleaseForm from '@/app/components/forms/release-form';

interface ReleaseDetailPageProps {
  params: Promise<{ releaseId: string }>;
}

export default async function ReleaseDetailPage({ params }: ReleaseDetailPageProps) {
  const { releaseId } = await params;
  return <ReleaseForm releaseId={releaseId} />;
}
