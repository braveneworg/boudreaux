/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { ResponsiveLightbox } from '@/app/components/responsive-lightbox';
import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import { useSubmissionQuery } from '@/hooks/queries/use-submission-query';
import { NAMELESS_OWNER, submissionCategoryLabel } from '@/lib/constants/submissions';
import type { SubmissionViewPayload } from '@/lib/types/domain/submission';

import { SubmissionViewContent } from './submission-view';
import { SubmissionViewBeacon } from './submission-view-beacon';

/** The title, in the cutout face, clear of the surface's close button. */
const TITLE_CLASS =
  'font-fake-four-cutout pr-8 text-2xl leading-tight font-normal break-words text-zinc-950 uppercase sm:text-3xl';

/** The desktop dialog: as tall as the window allows, scrolling inside itself. */
const DIALOG_CLASS = 'max-h-[calc(100dvh-4rem)] overflow-y-auto';

/** What the surface is called and described as, for a screen reader and on screen. */
interface ModalNaming {
  title: string;
  description: string;
  /** Whether the title is drawn: only a submission's own title is. */
  isTitleShown: boolean;
}

const LOADING: ModalNaming = {
  title: 'Loading submission',
  description: 'The submission is loading.',
  isTitleShown: false,
};

const FAILED: ModalNaming = {
  title: 'Could not load',
  description: 'The submission could not be loaded.',
  isTitleShown: true,
};

const NOT_AVAILABLE: ModalNaming = {
  title: 'Not available',
  description: 'This submission cannot be opened.',
  isTitleShown: true,
};

/** A submission's own naming: its title, then who shared it and as what. */
const namingOf = ({ title, owner, category }: SubmissionViewPayload): ModalNaming => ({
  title: title === '' ? 'Untitled' : title,
  description: `Shared by ${owner.username ?? NAMELESS_OWNER} in ${submissionCategoryLabel(category)}.`,
  isTitleShown: true,
});

const LoadingBody = () => (
  <div aria-busy="true" className="flex flex-col gap-4">
    <p role="status" className="sr-only">
      Loading submission…
    </p>
    <Skeleton className="h-8 w-2/3" />
    <Skeleton className="h-12 w-48" />
    <Skeleton className="aspect-video w-full" />
  </div>
);

const FailedBody = ({ onRetry }: { onRetry: () => void }) => (
  <div role="alert" className="flex flex-col items-start gap-4">
    <p className="text-zinc-950">Unable to load this submission.</p>
    <Button variant="outline" onClick={onRetry}>
      Try again
    </Button>
  </div>
);

/** One answer for every refusal, as the route gives: never a reason. */
const NotAvailableBody = () => (
  <p className="text-zinc-950">
    This submission is not available. It may have been taken down, or you may need to sign in to see
    it.
  </p>
);

/**
 * The submission as its reader may see it, and the beacon that asks for the
 * opening to be counted. Only an opening that can be a view asks: a public
 * submission, read by someone who is neither its owner nor an approver. The
 * route holds the same rule; this only saves the request.
 */
const SubmissionBody = ({ view }: { view: SubmissionViewPayload }) => (
  <>
    <SubmissionViewContent view={view} reportable titled={false} />
    {view.isPublic && view.viewer === 'public' && <SubmissionViewBeacon submissionId={view.id} />}
  </>
);

/** Where the read of the submission stands. */
interface SubmissionRead {
  /** The submission, once read; `null` before then and when it cannot be opened. */
  view: SubmissionViewPayload | null;
  isPending: boolean;
  isError: boolean;
}

/** The naming for wherever the read stands: the submission's own once it is here. */
const namingFor = ({ view, isPending, isError }: SubmissionRead): ModalNaming => {
  if (view) return namingOf(view);
  if (isPending) return LOADING;

  return isError ? FAILED : NOT_AVAILABLE;
};

/** The body for wherever the read stands. */
const ModalBody = ({ read, onRetry }: { read: SubmissionRead; onRetry: () => void }) => {
  if (read.view) return <SubmissionBody view={read.view} />;
  if (read.isPending) return <LoadingBody />;

  return read.isError ? <FailedBody onRetry={onRetry} /> : <NotAvailableBody />;
};

export interface SubmissionModalProps {
  /** The submission to show, or `null` before any has been opened. */
  submissionId: string | null;
  open: boolean;
  /** The visitor dismissed it. The host closes it: this never closes by itself. */
  onClose: () => void;
  /**
   * Where focus goes once it has closed. The surface has no trigger of its
   * own, so without this focus is left on nothing.
   */
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * The submission modal (ADR-0030): one submission, opened over the page the
 * visitor is on. It is a centred dialog on a wide screen and a drawer rising
 * from the bottom on a phone. A submission is never a page of its own.
 *
 * It reads the submission for this reader when it opens. The surface is
 * named by the submission's title, so the content sets no heading of its
 * own. While the read is out it says so; a submission the reader may not
 * open gets one answer whatever the reason, as the route gives.
 */
export const SubmissionModal = ({
  submissionId,
  open,
  onClose,
  onCloseAutoFocus,
}: SubmissionModalProps) => {
  const { data, isPending, isError, refetch } = useSubmissionQuery(submissionId);
  const read: SubmissionRead = { view: data ?? null, isPending, isError };
  const naming = namingFor(read);

  return (
    <ResponsiveLightbox
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onCloseAutoFocus={onCloseAutoFocus}
      title={naming.title}
      description={naming.description}
      titleClassName={naming.isTitleShown ? TITLE_CLASS : 'sr-only'}
      descriptionClassName="sr-only"
      dialogClassName={DIALOG_CLASS}
    >
      <ModalBody read={read} onRetry={() => void refetch()} />
    </ResponsiveLightbox>
  );
};
