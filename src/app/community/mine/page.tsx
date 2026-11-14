/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The owner's own list at `/community/mine` (sign-in required): every
 * submission they hold, in any state, with a rejection's reason. It is the
 * only place a draft or a rejected submission is listed.
 */
import Link from 'next/link';

import { SubmissionCardPicture } from '@/app/components/community/submission-card-picture';
import { Button } from '@/app/components/ui/button';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZineHeading } from '@/app/components/ui/zine-heading';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { requireCommunityUser } from '@/lib/community/community-session';
import { SubmissionService } from '@/lib/services/submission-service';
import type { SubmissionRecord } from '@/lib/types/domain/submission';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Your submissions',
  robots: { index: false, follow: false },
};

const BREADCRUMBS = [{ anchorText: 'Your submissions', url: '/community/mine', isActive: true }];

/** Where a submission stands, in a few words. */
const stateLabel = ({ status, listed }: SubmissionRecord): string => {
  if (status === 'DRAFT') {
    return 'Draft';
  }

  if (status === 'AWAITING_APPROVAL') {
    return 'Awaiting approval';
  }

  if (status === 'REJECTED') {
    return 'Not approved';
  }

  return listed ? 'Approved, listed' : 'Approved, unlisted';
};

interface SubmissionRowProps {
  submission: SubmissionRecord;
  /** Its card picture's address, when it has one. */
  cardPictureUrl: string | undefined;
}

const SubmissionRow = ({ submission, cardPictureUrl }: SubmissionRowProps) => {
  const title = submission.title === '' ? 'Untitled' : submission.title;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
      <SubmissionCardPicture url={cardPictureUrl} category={submission.category} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/community/${submission.id}`}
          className="font-semibold underline underline-offset-4"
        >
          {title}
        </Link>
        {submission.status === 'REJECTED' && submission.rejectionReason !== null && (
          <p className="text-sm">Reason: {submission.rejectionReason}</p>
        )}
      </div>
      <span className="text-muted-foreground text-sm">{stateLabel(submission)}</span>
    </li>
  );
};

export default async function MySubmissionsPage() {
  const user = await requireCommunityUser('/community/mine');
  const submissions = await SubmissionService.listMine(user.id);
  const cardPictures = await SubmissionService.cardPictures(submissions);

  return (
    <PageContainer>
      <ContentContainer>
        <ZinePanel accent="kraft" breadcrumbs={BREADCRUMBS}>
          <ZineHeading level={1}>Your submissions</ZineHeading>
          {submissions.length === 0 ? (
            <p>You have not submitted anything yet.</p>
          ) : (
            <ul aria-label="Your submissions" className="divide-y border-y">
              {submissions.map((submission) => (
                <SubmissionRow
                  key={submission.id}
                  submission={submission}
                  cardPictureUrl={cardPictures.get(submission.id)}
                />
              ))}
            </ul>
          )}
          <Button asChild className="mt-6">
            <Link href="/community/submit">Submit something</Link>
          </Button>
        </ZinePanel>
      </ContentContainer>
    </PageContainer>
  );
}
