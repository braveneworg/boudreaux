/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The submission form at `/community/submit` (sign-in required). Server
 * Component: it reads who is signed in and whether their account still owes
 * the upload agreement, so the form never branches on a client session.
 */
import { SubmissionForm } from '@/app/components/community/submission-form';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZineHeading } from '@/app/components/ui/zine-heading';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { requireCommunityUser } from '@/lib/community/community-session';
import { UPLOAD_AGREEMENT_VERSION } from '@/lib/constants/submissions';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Submit something',
  robots: { index: false, follow: false },
};

const BREADCRUMBS = [
  { anchorText: 'Your submissions', url: '/community/mine', isActive: false },
  { anchorText: 'Submit something', url: '/community/submit', isActive: true },
];

export default async function SubmitPage() {
  const user = await requireCommunityUser('/community/submit');

  return (
    <PageContainer>
      <ContentContainer>
        <ZinePanel accent="kraft" breadcrumbs={BREADCRUMBS}>
          <ZineHeading level={1}>Submit something</ZineHeading>
          <SubmissionForm
            needsAgreement={user.uploadAgreementVersion !== UPLOAD_AGREEMENT_VERSION}
          />
        </ZinePanel>
      </ContentContainer>
    </PageContainer>
  );
}
