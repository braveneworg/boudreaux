/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One submission at `/community/<id>`. Its address holds only its id, so no
 * edit or rename breaks a shared link. Who may open it is the service's
 * decision, made for this reader; anyone it refuses gets the not-found page,
 * never a reason, so an address does not reveal that a submission exists.
 */
import { cache } from 'react';

import { notFound } from 'next/navigation';

import { SubmissionViewContent } from '@/app/components/community/submission-view';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { communityViewer } from '@/lib/community/community-session';
import { SubmissionService } from '@/lib/services/submission-service';
import type { SubmissionView } from '@/lib/types/domain/submission';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

import type { Metadata } from 'next';

interface SubmissionPageProps {
  params: Promise<{ id: string }>;
}

const NOT_INDEXED = { index: false, follow: false };

/**
 * What this request's reader sees of a submission, or `null`. Cached for the
 * request, so the metadata and the page share one read.
 */
const loadView = cache(async (id: string): Promise<SubmissionView | null> => {
  const viewer = await communityViewer();

  return isValidObjectId(id) ? SubmissionService.getForViewer(id, viewer) : null;
});

/**
 * Only a listed, public submission may be indexed. An unlisted one is open to
 * anyone who holds its link, and a search engine is not someone who holds it.
 */
export const generateMetadata = async ({ params }: SubmissionPageProps): Promise<Metadata> => {
  const { id } = await params;
  const view = await loadView(id);

  if (!view) {
    return { title: 'Not found', robots: NOT_INDEXED };
  }

  const title = view.title === '' ? 'Untitled' : view.title;

  return view.isPublic && view.listed ? { title } : { title, robots: NOT_INDEXED };
};

export default async function SubmissionPage({ params }: SubmissionPageProps) {
  const { id } = await params;
  const view = await loadView(id);

  if (!view) {
    notFound();
  }

  return (
    <PageContainer>
      <ContentContainer>
        <ZinePanel accent="kraft">
          <SubmissionViewContent view={view} />
        </ZinePanel>
      </ContentContainer>
    </PageContainer>
  );
}
