/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import type { SubmissionStatus } from '@/lib/constants/submissions';
import type { ReportedSubmissionRow } from '@/lib/types/domain/submission-report';

import { SubmissionCardPicture } from './submission-card-picture';

interface ReportedSubmissionsTableProps {
  /** The submissions that hold an open report, oldest open report first. */
  rows: ReportedSubmissionRow[];
  /** Each row's card picture, by submission id; a row without one has no entry. */
  cardPictures: Map<string, string>;
  /** The approver section's address; each row links to its review page under it. */
  queuePath: string;
}

// One fixed zone, so the server and every reader's browser print the same day.
const DAY = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

const STATE_LABELS: ReadonlyMap<SubmissionStatus, string> = new Map([
  ['DRAFT', 'Draft'],
  ['AWAITING_APPROVAL', 'Awaiting approval'],
  ['APPROVED', 'Approved'],
  ['REJECTED', 'Rejected'],
]);

/**
 * The Reported tab's table (ADR-0025): each submission with an open report,
 * the state it is in now, how many reports are open against it and when the
 * oldest was filed. A reported submission is still up unless its state says
 * otherwise; a report takes nothing down by itself.
 */
export const ReportedSubmissionsTable = ({
  rows,
  cardPictures,
  queuePath,
}: ReportedSubmissionsTableProps) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>
          <span className="sr-only">Picture</span>
        </TableHead>
        <TableHead>Title</TableHead>
        <TableHead>Owner</TableHead>
        <TableHead>State</TableHead>
        <TableHead>Open reports</TableHead>
        <TableHead>Oldest report</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((row) => (
        <TableRow key={row.id}>
          <TableCell>
            <SubmissionCardPicture url={cardPictures.get(row.id)} category={row.category} />
          </TableCell>
          <TableCell>
            <Link
              href={`${queuePath}/${row.id}`}
              className="font-semibold underline underline-offset-4"
            >
              {row.title === '' ? 'Untitled' : row.title}
            </Link>
          </TableCell>
          <TableCell>{row.ownerUsername ?? 'No username'}</TableCell>
          <TableCell>{STATE_LABELS.get(row.status) ?? row.status}</TableCell>
          <TableCell>{row.openReports}</TableCell>
          <TableCell>{DAY.format(row.oldestReportAt)}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);
