/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One submission as an approver reviews it, at `/admin/community/<id>`: the
 * submission as the public would see it, then the decision, then the reports
 * against it that this approver may read. The decision carries the
 * `updatedAt` this page loaded, so it is refused if the owner has changed the
 * submission since.
 */
import { notFound } from 'next/navigation';

import { SubmissionDecisionPanel } from '@/app/components/community/submission-decision-panel';
import { SubmissionReportList } from '@/app/components/community/submission-report-list';
import { SubmissionViewContent } from '@/app/components/community/submission-view';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { requireApprover } from '@/lib/community/community-session';
import { SubmissionReportService } from '@/lib/services/submission-report-service';
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
  const approver = { id: userId, role };

  const view = isValidObjectId(id) ? await SubmissionService.getForViewer(id, approver) : null;

  // A draft is in no queue, even when it is the approver's own.
  if (!view || view.status === 'DRAFT') {
    notFound();
  }

  // `null` for a manager on their own submission, who is kept from its reports.
  const reports = await SubmissionReportService.listForSubmission(
    { id: view.id, ownerId: view.ownerId },
    approver
  );

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
      {reports !== null && reports.length > 0 && <SubmissionReportList reports={reports} />}
    </ZinePanel>
  );
}
