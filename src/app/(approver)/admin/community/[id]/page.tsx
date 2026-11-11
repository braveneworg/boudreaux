/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One submission as an approver reviews it, at `/admin/community/<id>`: the
 * submission as the public would see it, then the decision. The decision
 * carries the `updatedAt` this page loaded, so it is refused if the owner has
 * changed the submission since.
 */
import { notFound } from 'next/navigation';

import { SubmissionDecisionPanel } from '@/app/components/community/submission-decision-panel';
import { SubmissionViewContent } from '@/app/components/community/submission-view';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { requireApprover } from '@/lib/community/community-session';
import { SubmissionService } from '@/lib/services/submission-service';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Review a submission' };

export const dynamic = 'force-dynamic';

interface ReviewSubmissionPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReviewSubmissionPage({ params }: ReviewSubmissionPageProps) {
  const { id: userId, role } = await requireApprover('approver');
  const { id } = await params;

  const view = isValidObjectId(id)
    ? await SubmissionService.getForViewer(id, { id: userId, role })
    : null;

  // A draft is in no queue, even when it is the approver's own.
  if (!view || view.status === 'DRAFT') {
    notFound();
  }

  const breadcrumbs = [
    { anchorText: 'Community', url: '/admin/community', isActive: false },
    {
      anchorText: view.title === '' ? 'Untitled' : view.title,
      url: `/admin/community/${id}`,
      isActive: true,
    },
  ];

  return (
    <ZinePanel accent="kraft" tape={false} breadcrumbs={breadcrumbs}>
      <SubmissionViewContent view={view} />
      <SubmissionDecisionPanel
        submissionId={view.id}
        status={view.status}
        loadedUpdatedAt={view.updatedAt.toISOString()}
      />
    </ZinePanel>
  );
}
