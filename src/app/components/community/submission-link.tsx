/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { MouseEvent, ReactNode } from 'react';

import Link from 'next/link';

import { useHydrated } from '@/hooks/use-hydrated';
import { submissionDeepLink } from '@/lib/community/community-paths';
import { isPlainLeftClick } from '@/lib/utils/is-plain-left-click';

import { useSubmissionModal } from './use-submission-modal';

export interface SubmissionLinkProps {
  /** The submission the link opens. */
  submissionId: string;
  className?: string;
  children: ReactNode;
}

/**
 * The link a visitor clicks to open a submission (ADR-0030). A plain click
 * opens the submission modal over the page they are on and goes nowhere. Its
 * href is the submission deep link, which a modified click opens in a new
 * tab, and which a click made before the page has hydrated follows: that
 * lands on the community page with the same submission open.
 *
 * Outside the community section no page hosts the modal, and the link is a
 * plain link to the deep link. It says it opens a dialog only once a click
 * would, which is also what an E2E click waits for.
 *
 * Never prefetched: the deep link is the whole community page, and a page
 * shows a dozen of these at a time.
 */
export const SubmissionLink = ({ submissionId, className, children }: SubmissionLinkProps) => {
  const modal = useSubmissionModal();
  const isHydrated = useHydrated();

  const openInPlace = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (!modal || !isPlainLeftClick(event)) {
      return;
    }

    event.preventDefault();
    modal.open(submissionId, event.currentTarget);
  };

  return (
    <Link
      href={submissionDeepLink(submissionId)}
      prefetch={false}
      onClick={openInPlace}
      aria-haspopup={modal && isHydrated ? 'dialog' : undefined}
      className={className}
    >
      {children}
    </Link>
  );
};
