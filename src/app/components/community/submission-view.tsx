/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { ArtistLinkIcon } from '@/app/components/artist-link-icon';
import { GravatarAvatar } from '@/app/components/gravatar-avatar';
import { ZineHeading } from '@/app/components/ui/zine-heading';
import { submissionCategoryLabel } from '@/lib/constants/submissions';
import type { SubmissionView } from '@/lib/types/domain/submission';

import { SubmissionAttachmentGallery } from './submission-attachment-gallery';
import { SubmissionHtml } from './submission-html';
import { SubmissionOwnerControls } from './submission-owner-controls';
import { SubmissionReportControl } from './submission-report-control';
import { SubmissionShare } from './submission-share';
import { SubmissionStatusStrip } from './submission-status-strip';

/** A link's host and path, without the scheme, for a shorter line to read. */
const readableUrl = (url: string): string => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

const SubmissionLinks = ({ links }: { links: string[] }) =>
  links.length === 0 ? null : (
    <ul aria-label="Links" className="mt-6 space-y-2">
      {links.map((url) => (
        <li key={url} className="flex min-w-0 items-center gap-2">
          <ArtistLinkIcon href={url} section="websites" />
          <a
            href={url}
            // Set here, never taken from input: every outbound link is hardened.
            rel="nofollow noopener noreferrer"
            target="_blank"
            className="min-w-0 truncate underline underline-offset-4"
          >
            {readableUrl(url)}
          </a>
        </li>
      ))}
    </ul>
  );

interface SubmissionViewContentProps {
  /** What this reader sees; it exists only because they may open the submission. */
  view: SubmissionView;
  /**
   * Whether this page offers the Report control: the submission's own page
   * does, and the approver's review page, where the decision is, does not.
   */
  reportable?: boolean;
}

/**
 * The body of a submission's page: its title, who posted it, its category,
 * its attachments, the about, the writing and the outbound links. Its owner and approvers also
 * get the status strip and their controls. Sharing is offered only on a public
 * submission, since nobody else could open the link, and so is reporting: to
 * every reader but the owner, an approver included.
 */
export const SubmissionViewContent = ({ view, reportable = false }: SubmissionViewContentProps) => {
  const title = view.title === '' ? 'Untitled' : view.title;
  const canReport = reportable && view.viewer !== 'owner';

  return (
    <article>
      <SubmissionStatusStrip
        status={view.status}
        viewer={view.viewer}
        listed={view.listed}
        isPublic={view.isPublic}
        rejectionReason={view.rejectionReason}
        queuePosition={view.queuePosition}
      />
      <ZineHeading level={1}>{title}</ZineHeading>
      <div className="flex items-center gap-3">
        <GravatarAvatar hash={view.owner.gravatarHash} size={48} defaultStyle="identicon" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{view.owner.username ?? 'A community member'}</p>
          <p className="text-muted-foreground text-sm">{submissionCategoryLabel(view.category)}</p>
        </div>
      </div>
      <SubmissionAttachmentGallery attachments={view.attachments} title={title} />
      <SubmissionHtml html={view.aboutHtml} className="mt-6" />
      <SubmissionHtml html={view.writingHtml} className="mt-6" />
      <SubmissionLinks links={view.links} />
      {view.isPublic && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <SubmissionShare submissionId={view.id} title={title} />
          {canReport && <SubmissionReportControl submissionId={view.id} title={title} />}
        </div>
      )}
      {view.viewer === 'owner' && (
        <SubmissionOwnerControls submissionId={view.id} status={view.status} listed={view.listed} />
      )}
      {view.viewer === 'approver' && (
        <p className="mt-6">
          <Link href={`/admin/community/${view.id}`} className="underline underline-offset-4">
            Review this submission
          </Link>
        </p>
      )}
    </article>
  );
};
