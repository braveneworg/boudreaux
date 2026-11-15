/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The community section's layout: it hosts the one submission modal
 * (ADR-0030), so a submission clicked on any community page opens over that
 * page and never navigates to a page of its own.
 *
 * It decides nothing about who may read: a layout does not render again on
 * a client-side navigation between its pages, so every page still asks for
 * itself (`community-session.ts`).
 */
import type { ReactNode } from 'react';

import { SubmissionModalProvider } from '@/app/components/community/submission-modal-provider';

interface CommunityLayoutProps {
  children: ReactNode;
}

export default function CommunityLayout({ children }: CommunityLayoutProps) {
  return <SubmissionModalProvider>{children}</SubmissionModalProvider>;
}
