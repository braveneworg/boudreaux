/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The community page at `/community` (CONTEXT.md): the public page headed
 * "User Submitted Content" that the menu calls Community. In order: its
 * search, the heading with a short description and a link to the form, the
 * two submission rows (Most Recent, then Trending when anything has the
 * views for it), and the full list of listed submissions.
 * `/community?user=<username>` narrows it to one user's listed submissions:
 * a filter on this page, not a page of its own.
 *
 * `/community?submission=<id>` is the submission deep link (ADR-0030): this
 * page with that submission open over it, in the modal the layout hosts. The
 * page reads the submission for this reader, hands it to the modal, and
 * titles itself with it, so a shared link previews as the submission.
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
import type {
  SubmissionCard,
  SubmissionOwnerName,
  SubmissionView,
} from '@/lib/types/domain/submission';
import type { AttachmentView } from '@/lib/types/domain/submission-attachment';
import { computeNextSkip } from '@/lib/types/pagination';
import { getQueryClient } from '@/lib/utils/get-query-client';
import { loggers } from '@/lib/utils/logger';
import { isValidObjectId } from '@/lib/utils/validation/object-id';
import {
  submissionListingQuerySchema,
  type SubmissionCardPage,
} from '@/lib/validation/submission-listing-schema';
import { toSubmissionViewPayload } from '@/lib/validation/submission-view-schema';

import type { Metadata } from 'next';

interface CommunityPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PAGE_TITLE = 'User Submitted Content';
const NOT_INDEXED = { index: false, follow: false };

/** A query value as it arrived: the first when repeated, `''` when missing. */
const readParam = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? '';

/**
 * Who is reading, once per request: the page and a deep link's read share
 * the answer. A banned account is refused here like on every community page.
 */
const loadViewer = cache(communityViewer);

/**
 * The submission a deep link names, as this request's reader may see it, or
 * `null`: no link, a value no id can be, a submission they may not open, or
 * a read that failed. The page renders either way, and the modal then reads
 * for itself in the browser. Cached for the request, so the metadata and the
 * page share one read.
 */
const loadLinkedSubmission = cache(async (raw: string): Promise<SubmissionView | null> => {
  if (!isValidObjectId(raw)) {
    return null;
  }

  const viewer = await loadViewer();
  try {
    return await SubmissionService.getForViewer(raw, viewer);
  } catch (error) {
    loggers.media.error('Community page deep link read failed', error);

    return null;
  }
});

/**
 * The picture a shared link previews with: the first photo, else a frame of
 * the first video (the card picture's rule, at full size).
 */
const previewImageOf = (attachments: AttachmentView[]): string | null => {
  const photo = attachments.find(({ kind }) => kind === 'IMAGE');
  const video = attachments.find(({ kind }) => kind === 'VIDEO');

  return photo?.url ?? video?.posterUrl ?? null;
};

/**
 * What a submission deep link says of itself: the submission's title, and
 * its picture for a link preview. Only a listed, public submission may be
 * indexed. An unlisted one is open to anyone who holds its link, and a
 * search engine is not someone who holds it.
 */
const linkedMetadata = (view: SubmissionView): Metadata => {
  const title = view.title === '' ? 'Untitled' : view.title;
  // Only a public submission's files are on the CDN; anything else would put
  // a signed link to a private copy into the page's head.
  const image = view.isPublic ? previewImageOf(view.attachments) : null;
  const metadata: Metadata =
    image === null ? { title } : { title, openGraph: { title, images: [image] } };

  return view.isPublic && view.listed ? metadata : { ...metadata, robots: NOT_INDEXED };
};

/** The listing route's own rule for a username: trimmed, and no longer than one can be. */
const usernameSchema = submissionListingQuerySchema.shape.user;

/**
 * The account a `?user=` filter names, or `null` when none holds that
 * username. Cached for the request, so the metadata and the page share one
 * read.
 */
const loadOwner = cache(async (raw: string): Promise<SubmissionOwnerName | null> => {
  const username = usernameSchema.safeParse(raw);

  // A value no username can be names no account; nothing is looked up.
  return username.success ? SubmissionService.ownerNamed(username.data) : null;
});

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

/** The page's own metadata: everyone's submissions, or one user's; `null` for a user who is not found. */
const listingMetadata = async (username: string): Promise<Metadata | null> => {
  if (username.trim() === '') {
    return { title: PAGE_TITLE, description: COMMUNITY_DESCRIPTION };
  }

  const owner = await loadOwner(username);

  return (
    owner && {
      title: `Submissions by ${owner.username}`,
      description: `What ${owner.username} has shared with the Fake Four Inc. community.`,
    }
  );
};

export async function generateMetadata({ searchParams }: CommunityPageProps): Promise<Metadata> {
  const { user, submission } = await searchParams;
  const listing = await listingMetadata(readParam(user));
  if (!listing) {
    return { title: 'Not found', robots: NOT_INDEXED };
  }

  // A deep link is shared as its submission, not as the page beneath it.
  const linked = await loadLinkedSubmission(readParam(submission));

  return linked ? linkedMetadata(linked) : listing;
}

/**
 * The Trending row's cards: the most viewed listed submissions of the last
 * thirty days. None when the read failed, so the page renders without the
 * row rather than not at all.
 */
const loadTrending = async (): Promise<SubmissionCard[]> => {
  try {
    return await SubmissionService.listTrendingCards();
  } catch (error) {
    loggers.media.error('Community page Trending read failed', error);

    return [];
  }
};

interface ListSectionProps {
  /** The first page the server read, or `null` when that read failed. */
  firstPage: SubmissionCardPage | null;
  /** The Trending row's cards; empty when nothing has the views for it. */
  trending: SubmissionCard[];
}

/** Everyone's submissions: both submission rows, the link down, and the full list. */
const EveryonesSubmissions = ({ firstPage, trending }: ListSectionProps) => {
  const recent = firstPage?.rows.slice(0, SUBMISSION_ROW_SIZE) ?? [];
  // Known to be empty: no row, no link, and no heading over an empty list.
  const isEmpty = firstPage !== null && firstPage.rows.length === 0;

  return (
    <>
      {/* An empty row renders nothing; the checks keep its margin out too. */}
      {recent.length > 0 && (
        <div className="mt-10">
          <SubmissionRow heading="Most Recent" cards={recent} />
        </div>
      )}
      {trending.length > 0 && (
        <div className="mt-8">
          <SubmissionRow heading="Trending" cards={trending} />
        </div>
      )}
      {(recent.length > 0 || trending.length > 0) && (
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
    <ZineHeading level={2}>
      {/* The username is set in the body face, in its own case: the cutout
          face has no digits and would print every username in capitals. */}
      Submissions by <span className="font-sans tracking-normal normal-case">{username}</span>
    </ZineHeading>
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
  if (username.trim() === '') {
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
  const { user, submission } = await searchParams;
  const owner = await readOwner(readParam(user));

  // Anyone may read this page; a banned account is refused here like on
  // every community page. Here the viewer only decides whether "Your
  // submissions" is offered.
  const viewer = await loadViewer();
  // One user's list shows no rows, so Trending is not read for it.
  const [firstPage, trending, linked] = await Promise.all([
    loadFirstPage(owner?.id),
    owner ? [] : loadTrending(),
    loadLinkedSubmission(readParam(submission)),
  ]);

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
  // A submission deep link: the layout's modal opens it on arrival, and
  // finds it here, under the key `useSubmissionQuery` reads.
  if (linked) {
    queryClient.setQueryData(
      queryKeys.submissions.detail(linked.id),
      toSubmissionViewPayload(linked)
    );
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
              <EveryonesSubmissions firstPage={firstPage} trending={trending} />
            )}
          </ZinePanel>
        </ContentContainer>
      </PageContainer>
    </HydrationBoundary>
  );
}
