/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { guestAddressKey, viewKeyFor } from '@/lib/community/view-key';
import { utcDayOf, viewWindowStart } from '@/lib/community/view-window';
import { isPublicSubmission, SubmissionRepository } from '@/lib/repositories/submission-repository';
import { SubmissionViewEventRepository } from '@/lib/repositories/submission-view-event-repository';
import type { SubmissionActor } from '@/lib/types/domain/submission';
import { isApproverRole } from '@/lib/utils/roles';
import { allowGuestView } from '@/lib/utils/submission-view-allowance';

/** One opening of a submission's page that asks to be counted. */
export interface ViewAttempt {
  submissionId: string;
  /** The session's user, or `null` for a guest. */
  viewer: SubmissionActor | null;
  /**
   * The guest's visitor id, as a download resolves it. Asked only when a
   * guest's view could count, so a request for anything else creates nothing.
   */
  resolveGuest: () => Promise<string>;
  /** The caller's address as the proxy reports it. Never stored. */
  address: string;
  now: Date;
}

/**
 * The rules of a view (CONTEXT.md, ADR-0029): one viewer opening a
 * submission's own page, counted at most once per viewer, per submission,
 * per UTC day. Every rule about what counts lives here; the route only
 * identifies the caller.
 */
export class SubmissionViewEventService {
  /**
   * Count this opening if it is a view, and say whether it was counted.
   * Never counted: a submission that is not public, the owner's own opening,
   * an approver's, and a viewer already counted for it today. A guest's view
   * is also held to what their address may still add to this submission
   * today; that is asked last, so an opening that would not have counted
   * anyway spends none of it.
   */
  static async record({
    submissionId,
    viewer,
    resolveGuest,
    address,
    now,
  }: ViewAttempt): Promise<boolean> {
    const standing = await SubmissionRepository.findStanding(submissionId);
    if (!standing || !isPublicSubmission(standing)) {
      return false;
    }

    if (viewer && (viewer.id === standing.ownerId || isApproverRole(viewer.role))) {
      return false;
    }

    const day = utcDayOf(now);
    if (viewer) {
      const viewKey = viewKeyFor({ submissionId, viewer: { kind: 'user', id: viewer.id }, day });

      return SubmissionViewEventRepository.record({ submissionId, viewKey, viewedAt: now });
    }

    const viewKey = viewKeyFor({
      submissionId,
      viewer: { kind: 'guest', id: await resolveGuest() },
      day,
    });
    if (await SubmissionViewEventRepository.exists(viewKey)) {
      return false;
    }

    if (!(await allowGuestView({ addressKey: guestAddressKey(address), submissionId }))) {
      return false;
    }

    return SubmissionViewEventRepository.record({ submissionId, viewKey, viewedAt: now });
  }

  /**
   * Delete the views that no longer count: those from before the last thirty
   * days, the same stretch Trending reads. Returns how many were deleted.
   */
  static async prune(now: Date): Promise<number> {
    return SubmissionViewEventRepository.deleteBefore(viewWindowStart(now));
  }
}
