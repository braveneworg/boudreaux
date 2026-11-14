/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The community page at `/community` (CONTEXT.md): the public page headed
 * "User Submitted Content" that the menu calls Community. In order: its
 * search, the heading with a short description and a link to the form, the
 * Most Recent submission row, and the full list of listed submissions.
 * `/community?user=<username>` narrows it to one user's listed submissions:
 * a filter on this page, not a page of its own.
 *
 * Server Component, open to anyone. It reads the newest listed submissions
 * once: they are the row's cards and the first page the list is hydrated
 * with. Only a listed submission is ever read here, whoever is asking.
 */
import { cache } from 'react';

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { Eye } from 'lucide-react';

import { CommunityList } from '@/app/components/community/community-list';
import { CommunitySearch } from '@/app/components/community/community-search';
import { SubmissionRow } from '@/app/components/community/submission-row';
import { ViewAllLink } from '@/app/components/community/view-all-link';
import type { BreadcrumbItemData } from '@/app/components/ui/breadcrumb-menu';
import { Button } from '@/app/components/ui/button';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZineHeading } from '@/app/components/ui/zine-heading';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import {
  ALL_SUBMISSIONS_ID,
  COMMUNITY_CRUMB,
  COMMUNITY_PATH,
  userSubmissionsPath,
} from '@/lib/community/community-paths';
import { communityViewer } from '@/lib/community/community-session';
import {
  COMMUNITY_DESCRIPTION,
  COMMUNITY_PAGE_SIZE,
  SUBMISSION_ROW_SIZE,
} from '@/lib/constants/submissions';
import { queryKeys } from '@/lib/query-keys';
import { SubmissionService } from '@/lib/services/submission-service';
import type { SubmissionOwnerName } from '@/lib/types/domain/submission';
import { computeNextSkip } from '@/lib/types/pagination';
import { getQueryClient } from '@/lib/utils/get-query-client';
import { loggers } from '@/lib/utils/logger';
import type { SubmissionCardPage } from '@/lib/validation/submission-listing-schema';

import type { Metadata } from 'next';

interface CommunityPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PAGE_TITLE = 'User Submitted Content';
const NOT_INDEXED = { index: false, follow: false };

/** The `?user=` username: the first value when repeated, `''` when missing or blank. */
const readUsername = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

/**
 * The account a `?user=` filter names, or `null` when none holds that
 * username. Cached for the request, so the metadata and the page share one
 * read.
 */
const loadOwner = cache(async (username: string): Promise<SubmissionOwnerName | null> =>
  SubmissionService.ownerNamed(username)
);

/**
 * The newest listed submissions, everyone's or one owner's: the first page
 * of the list. `null` when the read failed, so the page still renders and
 * the list reads for itself in the browser.
 */
const loadFirstPage = async (ownerId: string | undefined): Promise<SubmissionCardPage | null> => {
  try {
    const rows = await SubmissionService.listCards({
      skip: 0,
      take: COMMUNITY_PAGE_SIZE,
      ...(ownerId !== undefined && { ownerId }),
    });

    return { rows, nextSkip: computeNextSkip(rows.length, 0, COMMUNITY_PAGE_SIZE) };
  } catch (error) {
    loggers.media.error('Community page first read failed', error);

    return null;
  }
};

export async function generateMetadata({ searchParams }: CommunityPageProps): Promise<Metadata> {
  const username = readUsername((await searchParams).user);
  if (username === '') {
    return { title: PAGE_TITLE, description: COMMUNITY_DESCRIPTION };
  }

  const owner = await loadOwner(username);
  if (!owner) {
    return { title: 'Not found', robots: NOT_INDEXED };
  }

  return {
    title: `Submissions by ${owner.username}`,
    description: `What ${owner.username} has shared with the Fake Four Inc. community.`,
  };
}

interface ListSectionProps {
  /** The first page the server read, or `null` when that read failed. */
  firstPage: SubmissionCardPage | null;
}

/** Everyone's submissions: the Most Recent row, the link down, and the full list. */
const EveryonesSubmissions = ({ firstPage }: ListSectionProps) => {
  const recent = firstPage?.rows.slice(0, SUBMISSION_ROW_SIZE) ?? [];
  // Known to be empty: no row, no link, and no heading over an empty list.
  const isEmpty = firstPage !== null && firstPage.rows.length === 0;

  return (
    <>
      <div className="mt-10">
        <SubmissionRow heading="Most Recent" cards={recent} />
      </div>
      {recent.length > 0 && (
        <p className="mt-2">
          <ViewAllLink />
        </p>
      )}
      <section className="mt-10">
        {!isEmpty && (
          <ZineHeading
            level={2}
            id={ALL_SUBMISSIONS_ID}
            // Focusable so "view all" can hand it keyboard focus; never a tab stop.
            tabIndex={-1}
            className="scroll-mt-4 focus-visible:outline-none"
          >
            All submissions
          </ZineHeading>
        )}
        <CommunityList emptyMessage="Nothing here yet. Be the first to submit something." />
      </section>
    </>
  );
};

/** One user's listed submissions, under their username and a link back to everyone's. */
const UsersSubmissions = ({ username }: { username: string }) => (
  <section className="mt-10">
    <ZineHeading level={2}>Submissions by {username}</ZineHeading>
    <p className="mb-6 text-sm">
      <Link
        href={COMMUNITY_PATH}
        className="inline-flex items-center gap-1.5 underline underline-offset-4 hover:no-underline"
      >
        <Eye className="size-4" aria-hidden="true" />
        <span>View everyone’s submissions</span>
      </Link>
    </p>
    <CommunityList user={username} emptyMessage="Nothing listed yet." />
  </section>
);

/**
 * The account a `?user=` filter names, or `null` with no filter. A filter
 * that names no account is a 404, as an unknown `/videos?artist=` is.
 */
const readOwner = async (username: string): Promise<SubmissionOwnerName | null> => {
  if (username === '') {
    return null;
  }

  const owner = await loadOwner(username);
  if (!owner) {
    notFound();
  }

  return owner;
};

/** The way back: the community page, then the user a filter names. */
const breadcrumbsFor = (owner: SubmissionOwnerName | null): BreadcrumbItemData[] =>
  owner
    ? [
        COMMUNITY_CRUMB,
        { anchorText: owner.username, url: userSubmissionsPath(owner.username), isActive: true },
      ]
    : [{ ...COMMUNITY_CRUMB, isActive: true }];

/** The heading, the agreed description, and the way to the form. */
const PageIntro = ({ signedIn }: { signedIn: boolean }) => (
  <>
    <ZineHeading level={1}>{PAGE_TITLE}</ZineHeading>
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <p className="max-w-prose text-zinc-950">{COMMUNITY_DESCRIPTION}</p>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        <Button asChild>
          <Link href="/community/submit">Submit something</Link>
        </Button>
        {signedIn && (
          <Link href="/community/mine" className="text-sm underline underline-offset-4">
            Your submissions
          </Link>
        )}
      </div>
    </div>
  </>
);

export default async function CommunityPage({ searchParams }: CommunityPageProps) {
  const owner = await readOwner(readUsername((await searchParams).user));

  // Anyone may read this page; a banned account is refused here like on
  // every community page. The viewer only decides whether "Your
  // submissions" is offered.
  const viewer = await communityViewer();
  const firstPage = await loadFirstPage(owner?.id);

  // Seed the list's first page under the key `useInfiniteListedSubmissionsQuery`
  // reads, so it hydrates without a request. The service is read directly:
  // a request to this app's own route fails silently under load.
  const queryClient = getQueryClient();
  if (firstPage) {
    queryClient.setQueryData(queryKeys.submissions.listedInfinite(owner?.username ?? ''), {
      pages: [firstPage],
      pageParams: [0],
    });
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer>
        <ContentContainer>
          <ZinePanel accent="kraft" breadcrumbs={breadcrumbsFor(owner)}>
            <CommunitySearch className="mb-6" />
            <PageIntro signedIn={viewer !== null} />
            {owner ? (
              <UsersSubmissions username={owner.username} />
            ) : (
              <EveryonesSubmissions firstPage={firstPage} />
            )}
          </ZinePanel>
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
