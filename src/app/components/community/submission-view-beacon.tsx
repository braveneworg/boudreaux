/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useSubmissionViewBeacon } from './use-submission-view-beacon';

export interface SubmissionViewBeaconProps {
  /** The submission whose page this is. */
  submissionId: string;
}

/**
 * What makes opening a submission's page a view (CONTEXT.md): it renders
 * nothing and, once mounted in a browser, asks the server to count the
 * opening. A page that is only rendered, by a link preview or a crawler,
 * never mounts it and is never a view.
 *
 * The page renders it only for a reader who can be counted. The server
 * holds the same rule; leaving it out for an owner or an approver only
 * saves the request.
 */
export const SubmissionViewBeacon = ({ submissionId }: SubmissionViewBeaconProps) => {
  useSubmissionViewBeacon(submissionId);

  return null;
};
