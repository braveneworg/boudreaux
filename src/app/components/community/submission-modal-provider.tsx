/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import nextDynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useQueryClient } from '@tanstack/react-query';

import { SUBMISSION_PARAM } from '@/lib/community/community-paths';
import { queryKeys } from '@/lib/query-keys';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

import { SubmissionModalContext, type SubmissionModalControls } from './use-submission-modal';

// Interaction-only: the submission's players, its sharing and its report
// form load when a submission is first opened, never with the page. The
// modal draws itself once it has loaded, so there is nothing to hold a place
// for.
const SubmissionModal = nextDynamic(
  () => import('./submission-modal').then((mod) => ({ default: mod.SubmissionModal })),
  { ssr: false, loading: () => null }
);

/** The submission the modal shows, and where the visitor was when it opened. */
interface ShownSubmission {
  id: string;
  /** The address it was opened on: moving to any other closes it. */
  location: string;
  isOpen: boolean;
}

/** A path and its query, as one address. */
const addressOf = (pathname: string, query: string): string =>
  query === '' ? pathname : `${pathname}?${query}`;

export interface SubmissionModalProviderProps {
  children: ReactNode;
}

/**
 * Hosts the one submission modal of the community section (ADR-0030), and
 * hands every opener beneath it the way to open it.
 *
 * - **In place.** `open(id)` shows a submission over the page the visitor
 *   is on. The address does not change.
 * - **On arrival.** A submission deep link (`?submission=<id>`) opens the
 *   submission it names once the page has mounted. Closing it replaces the
 *   address with the same page without the parameter, so back and refresh
 *   do not reopen it.
 * - **Never over another page.** It is open only at the address it was
 *   opened on, so a link inside it, or the browser's back, closes it.
 *
 * An in-place opening drops whatever the cache held of that submission
 * first. A rejection, an edit or a ban takes a submission offline, and what
 * a reader saw a minute ago must not be shown again in its place. A deep
 * link keeps what the server just read for it.
 *
 * It reads the query string, so every page beneath it must be rendered per
 * request, as each community page is: it reads the session.
 */
export const SubmissionModalProvider = ({ children }: SubmissionModalProviderProps) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const location = addressOf(pathname, query);
  const linked = searchParams.get(SUBMISSION_PARAM) ?? '';
  const arrivalId = isValidObjectId(linked) ? linked : null;
  const [shown, setShown] = useState<ShownSubmission | null>(null);
  /** What the visitor clicked to open it; `null` for a deep link's arrival. */
  const openerRef = useRef<HTMLElement | null>(null);

  // Opened in an effect, not on the first render: on a phone the surface is
  // a drawer, which is known only once mounted, and an effect of this pass
  // is flushed with that one. Opening is idempotent, so a replayed effect
  // opens it once.
  useEffect(() => {
    if (arrivalId !== null) {
      openerRef.current = null;
      setShown({ id: arrivalId, location, isOpen: true });
    }
  }, [arrivalId, location]);

  const controls: SubmissionModalControls = {
    open: (submissionId, opener = null) => {
      queryClient.removeQueries({
        queryKey: queryKeys.submissions.detail(submissionId),
        exact: true,
      });
      openerRef.current = opener;
      setShown({ id: submissionId, location, isOpen: true });
    },
    close: () => {
      setShown((current) => current && { ...current, isOpen: false });
      if (arrivalId === null) {
        return;
      }

      const rest = new URLSearchParams(query);
      rest.delete(SUBMISSION_PARAM);
      router.replace(addressOf(pathname, rest.toString()), { scroll: false });
    },
  };

  // The surface has no trigger of its own, so it would leave focus on
  // nothing. Hand it back to what the visitor clicked, when that is still on
  // the page; a deep link's arrival has no opener, and the default stands.
  const returnFocus = (event: Event): void => {
    const opener = openerRef.current;
    if (opener?.isConnected) {
      event.preventDefault();
      opener.focus();
    }
  };

  return (
    <SubmissionModalContext value={controls}>
      {children}
      {/* Kept mounted once shown, so it can leave with its content in place. */}
      {shown && (
        <SubmissionModal
          submissionId={shown.id}
          open={shown.isOpen && shown.location === location}
          onClose={controls.close}
          onCloseAutoFocus={returnFocus}
        />
      )}
    </SubmissionModalContext>
  );
};
