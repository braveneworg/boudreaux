/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { submissionReportReasonPhrase } from '@/lib/constants/submissions';
import type { SubmissionReportView } from '@/lib/types/domain/submission-report';

import { SubmissionReportHandleButton } from './submission-report-handle-button';

interface SubmissionReportListProps {
  /** A submission's reports as this approver may read them, open first. */
  reports: SubmissionReportView[];
}

// One fixed zone, so the server and every reader's browser print the same day.
const DAY = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

const NOTHING_BY_ITSELF =
  'A report changes nothing by itself. Reject the submission above to take it offline, or mark a report handled once you have looked.';

/** How many are open and how many handled, in a sentence. */
const tallyOf = (reports: SubmissionReportView[]): string => {
  const open = reports.filter(({ handled }) => !handled).length;
  const handled = reports.length - open;

  return handled === 0 ? `${open} open.` : `${open} open, ${handled} handled.`;
};

/**
 * A mail link to an address a stranger typed. A valid address may hold `?`,
 * `&` and `=` before its `@`, which a mail link reads as extra fields (a
 * copy to someone else, a subject), so everything but the `@` is encoded.
 */
const mailLinkFor = (address: string): string =>
  `mailto:${address.split('@').map(encodeURIComponent).join('@')}`;

/**
 * What a reader learns of a report's contact email: the address for an
 * admin, that one was left for a manager, nothing when none is held.
 */
const ReportContact = ({ hasContact, contactEmail }: SubmissionReportView) => {
  if (!hasContact) {
    return null;
  }

  return contactEmail === null ? (
    <p className="text-sm">A contact email was left. Ask an admin to reply.</p>
  ) : (
    <p className="min-w-0 truncate text-sm">
      Contact:{' '}
      <a href={mailLinkFor(contactEmail)} className="underline underline-offset-4">
        {contactEmail}
      </a>
    </p>
  );
};

/** Who handled a report and when, or the button that does it. */
const ReportHandling = ({ id, handled, handledAt, handledByUsername }: SubmissionReportView) => {
  if (!handled) {
    return <SubmissionReportHandleButton reportId={id} />;
  }

  const when = handledAt ? ` ${DAY.format(handledAt)}` : '';
  const who = handledByUsername === null ? '' : ` by ${handledByUsername}`;

  return <p className="text-muted-foreground text-sm">{`Handled${when}${who}`}</p>;
};

/**
 * The reports against a submission, under its decision on the review page
 * (ADR-0025, ADR-0028): each one's reason, when it was filed, its note, what
 * this reader may know of its contact email, and whether it is handled.
 *
 * A note is a stranger's text. It is drawn as text, with its line breaks, and
 * never as markup.
 */
export const SubmissionReportList = ({ reports }: SubmissionReportListProps) => (
  <section aria-labelledby="submission-reports-heading" className="mt-8 border-t pt-6">
    <h2 id="submission-reports-heading" className="text-lg font-semibold">
      Reports
    </h2>
    <p className="text-sm">{tallyOf(reports)}</p>
    <p className="text-muted-foreground mt-1 text-sm">{NOTHING_BY_ITSELF}</p>
    <ul aria-label="Reports" className="mt-4 space-y-4">
      {reports.map((report) => (
        <li key={report.id} className="border-foreground min-w-0 space-y-2 border-2 p-3">
          <p className="font-semibold">
            {`Reported as ${submissionReportReasonPhrase(report.reason)}`}
          </p>
          <p className="text-muted-foreground text-sm">{`Filed ${DAY.format(report.createdAt)}`}</p>
          {report.note === '' ? (
            <p className="text-muted-foreground text-sm">No note was left.</p>
          ) : (
            <p className="break-words whitespace-pre-wrap">{report.note}</p>
          )}
          <ReportContact {...report} />
          <ReportHandling {...report} />
        </li>
      ))}
    </ul>
  </section>
);
