/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The submission form loaded with one of the owner's submissions, at
 * `/community/<id>/edit` (sign-in required). Only its owner reaches it: an
 * approver who can read a submission still cannot edit it.
 */
import { notFound } from 'next/navigation';

import { SubmissionForm } from '@/app/components/community/submission-form';
import { SubmissionStatusStrip } from '@/app/components/community/submission-status-strip';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZineHeading } from '@/app/components/ui/zine-heading';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { requireCommunityUser } from '@/lib/community/community-session';
import { UPLOAD_AGREEMENT_VERSION } from '@/lib/constants/submissions';
import { SubmissionService } from '@/lib/services/submission-service';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Edit your submission',
  robots: { index: false, follow: false },
};

interface EditSubmissionPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditSubmissionPage({ params }: EditSubmissionPageProps) {
  const { id } = await params;
  const user = await requireCommunityUser(`/community/${id}/edit`);

  const view = isValidObjectId(id)
    ? await SubmissionService.getForViewer(id, { id: user.id, role: user.role })
    : null;

  if (view?.viewer !== 'owner') {
    notFound();
  }

  const breadcrumbs = [
    { anchorText: 'Your submissions', url: '/community/mine', isActive: false },
    { anchorText: 'Edit', url: `/community/${id}/edit`, isActive: true },
  ];

  return (
    <PageContainer>
      <ContentContainer>
        <ZinePanel accent="kraft" breadcrumbs={breadcrumbs}>
          <ZineHeading level={1}>Edit your submission</ZineHeading>
          <SubmissionStatusStrip
            status={view.status}
            viewer={view.viewer}
            listed={view.listed}
            isPublic={view.isPublic}
            rejectionReason={view.rejectionReason}
            queuePosition={view.queuePosition}
          />
          <SubmissionForm
            needsAgreement={user.uploadAgreementVersion !== UPLOAD_AGREEMENT_VERSION}
            submission={{
              id: view.id,
              title: view.title,
              category: view.category,
              aboutHtml: view.aboutHtml,
              writingHtml: view.writingHtml,
              links: view.links,
              listed: view.listed,
              status: view.status,
            }}
          />
        </ZinePanel>
      </ContentContainer>
    </PageContainer>
  );
}
