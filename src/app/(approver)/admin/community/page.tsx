/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The approvers' queue at `/admin/community`: the submissions awaiting
 * approval, oldest first, with the approved and the rejected ones a tab away
 * (`?status=approved`, `?status=rejected`), and the submissions that hold an
 * open report on a fourth (`?status=reported`). An admin or a manager reaches
 * it.
 */
import type { ReactNode } from 'react';

import Link from 'next/link';

import { Inbox } from 'lucide-react';

import { ReportedSubmissionsTable } from '@/app/components/community/reported-submissions-table';
import { SubmissionCardPicture } from '@/app/components/community/submission-card-picture';
import { SectionHeader } from '@/app/components/ui/section-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import { requireApprover } from '@/lib/community/community-session';
import { submissionCategoryLabel } from '@/lib/constants/submissions';
import type { SubmissionStatus } from '@/lib/constants/submissions';
import { SubmissionReportService } from '@/lib/services/submission-report-service';
import { SubmissionService } from '@/lib/services/submission-service';
import type { SubmissionActor, SubmissionQueueRow } from '@/lib/types/domain/submission';
import { cn } from '@/lib/utils';
import { isAdminRole } from '@/lib/utils/roles';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Community submissions' };

export const dynamic = 'force-dynamic';

const QUEUE_PATH = '/admin/community';
const PAGE_SIZE = 25;

/** The `?status=` value of the tab that lists submissions with an open report. */
const REPORTED_SLUG = 'reported';
const REPORTED_EMPTY = 'No submission has an open report.';

interface QueueTab {
  /** The `?status=` value; the first tab is the default and needs none. */
  slug: 'awaiting' | 'approved' | 'rejected';
  status: SubmissionStatus;
  label: string;
  /** What the dated column holds for this queue. */
  dateLabel: string;
  empty: string;
}

const TABS: readonly QueueTab[] = [
  {
    slug: 'awaiting',
    status: 'AWAITING_APPROVAL',
    label: 'Awaiting approval',
    dateLabel: 'Published',
    empty: 'Nothing is awaiting approval.',
  },
  {
    slug: 'approved',
    status: 'APPROVED',
    label: 'Approved',
    dateLabel: 'Approved',
    empty: 'Nothing has been approved yet.',
  },
  {
    slug: 'rejected',
    status: 'REJECTED',
    label: 'Rejected',
    dateLabel: 'Rejected',
    empty: 'Nothing has been rejected.',
  },
];

const [DEFAULT_TAB] = TABS;
const DEFAULT_SLUG = (DEFAULT_TAB as QueueTab).slug;

const DAY = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value.at(0) : value) ?? '';

const tabFor = (slug: string): QueueTab =>
  TABS.find((tab) => tab.slug === slug) ?? (DEFAULT_TAB as QueueTab);

/** The page a `?page=` value names; anything that is not a positive integer is the first. */
const pageFor = (value: string): number => {
  const page = Number.parseInt(value, 10);

  return Number.isInteger(page) && page > 0 ? page : 1;
};

/** A tab's address at a page. The default tab's first page is the bare path. */
const hrefFor = (slug: string, page = 1): string => {
  const query = new URLSearchParams();
  if (slug !== DEFAULT_SLUG) {
    query.set('status', slug);
  }
  if (page > 1 || slug !== DEFAULT_SLUG) {
    query.set('page', String(page));
  }
  const search = query.toString();

  return search === '' ? QUEUE_PATH : `${QUEUE_PATH}?${search}`;
};

/** The date the queue orders by: when it was published, approved or rejected. */
const datedAt = (tab: QueueTab, row: SubmissionQueueRow): Date | null => {
  if (tab.status === 'APPROVED') {
    return row.approvedAt;
  }

  return tab.status === 'REJECTED' ? row.rejectedAt : row.publishedAt;
};

interface QueueTableProps {
  tab: QueueTab;
  rows: SubmissionQueueRow[];
  /** Each row's card picture, by submission id; a row without one has no entry. */
  cardPictures: Map<string, string>;
}

const QueueTable = ({ tab, rows, cardPictures }: QueueTableProps) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>
          <span className="sr-only">Picture</span>
        </TableHead>
        <TableHead>Title</TableHead>
        <TableHead>Owner</TableHead>
        <TableHead>Category</TableHead>
        <TableHead>Appears</TableHead>
        <TableHead>{tab.dateLabel}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((row) => {
        const date = datedAt(tab, row);

        return (
          <TableRow key={row.id}>
            <TableCell>
              <SubmissionCardPicture url={cardPictures.get(row.id)} category={row.category} />
            </TableCell>
            <TableCell>
              <Link
                href={`${QUEUE_PATH}/${row.id}`}
                className="font-semibold underline underline-offset-4"
              >
                {row.title === '' ? 'Untitled' : row.title}
              </Link>
            </TableCell>
            <TableCell>{row.ownerUsername ?? 'No username'}</TableCell>
            <TableCell>{submissionCategoryLabel(row.category)}</TableCell>
            <TableCell>{row.listed ? 'Listed' : 'Unlisted'}</TableCell>
            <TableCell>{date ? DAY.format(date) : ''}</TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  </Table>
);

interface QueueFrameProps {
  /** The `?status=` value of the tab being shown. */
  slug: string;
  page: number;
  /** How many rows the tab holds across every page. */
  total: number;
  /** How many submissions hold an open report, as this approver counts them. */
  reportedCount: number;
  isAdmin: boolean;
  children: ReactNode;
}

/** What every tab shares: the heading, the tabs, the tab's rows, the paging. */
const QueueFrame = ({ slug, page, total, reportedCount, isAdmin, children }: QueueFrameProps) => {
  const hasNext = page * PAGE_SIZE < total;
  const tabs = [
    ...TABS.map((tab) => ({ slug: tab.slug as string, label: tab.label })),
    {
      slug: REPORTED_SLUG,
      // A report takes nothing down by itself, so the tab says when one is waiting.
      label: reportedCount > 0 ? `Reported (${reportedCount})` : 'Reported',
    },
  ];

  return (
    <ZinePanel
      accent="kraft"
      tape={false}
      contentClassName="space-y-6"
      breadcrumbs={[{ anchorText: 'Community', url: QUEUE_PATH, isActive: true }]}
    >
      <SectionHeader
        icon={Inbox}
        title="Community submissions"
        helpText="Nothing a user submits can be opened by anyone else until an approver approves it. Approve or reject each submission; a rejection needs a reason its owner will read. A report tells you someone objects to a submission and changes nothing by itself."
      />

      <nav aria-label="Queues" className="flex flex-wrap items-center gap-4">
        {tabs.map((item) => (
          <Link
            key={item.slug}
            href={hrefFor(item.slug)}
            aria-current={item.slug === slug ? 'page' : undefined}
            className={cn(
              'underline-offset-8',
              item.slug === slug
                ? 'font-semibold underline'
                : 'text-muted-foreground hover:underline'
            )}
          >
            {item.label}
          </Link>
        ))}
        {isAdmin && (
          <Link href={`${QUEUE_PATH}/managers`} className="ml-auto underline underline-offset-4">
            Managers
          </Link>
        )}
      </nav>

      {children}

      {(page > 1 || hasNext) && (
        <nav aria-label="Pages" className="flex items-center gap-4">
          {page > 1 && (
            <Link href={hrefFor(slug, page - 1)} className="underline underline-offset-4">
              Previous page
            </Link>
          )}
          {hasNext && (
            <Link href={hrefFor(slug, page + 1)} className="underline underline-offset-4">
              Next page
            </Link>
          )}
        </nav>
      )}
    </ZinePanel>
  );
};

interface QueuePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function QueuePage({ searchParams }: QueuePageProps) {
  const user = await requireApprover('approver');
  const reader: SubmissionActor = { id: user.id, role: user.role };
  const isAdmin = isAdminRole(user.role);
  const query = await searchParams;
  const slug = first(query.status);
  const page = pageFor(first(query.page));
  const paging = { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE };

  if (slug === REPORTED_SLUG) {
    const { rows, total } = await SubmissionReportService.listReported(reader, paging);
    const cardPictures = await SubmissionService.cardPictures(rows);

    return (
      <QueueFrame slug={slug} page={page} total={total} reportedCount={total} isAdmin={isAdmin}>
        {rows.length === 0 ? (
          <p>{REPORTED_EMPTY}</p>
        ) : (
          <ReportedSubmissionsTable
            rows={rows}
            cardPictures={cardPictures}
            queuePath={QUEUE_PATH}
          />
        )}
      </QueueFrame>
    );
  }

  const tab = tabFor(slug);
  const [{ rows, total }, reportedCount] = await Promise.all([
    SubmissionService.listQueue(tab.status, paging),
    SubmissionReportService.countReported(reader),
  ]);
  const cardPictures = await SubmissionService.cardPictures(rows);

  return (
    <QueueFrame
      slug={tab.slug}
      page={page}
      total={total}
      reportedCount={reportedCount}
      isAdmin={isAdmin}
    >
      {rows.length === 0 ? (
        <p>{tab.empty}</p>
      ) : (
        <QueueTable tab={tab} rows={rows} cardPictures={cardPictures} />
      )}
    </QueueFrame>
  );
}
