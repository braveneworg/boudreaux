/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useEffect } from 'react';

import { submissionViewPath } from '@/lib/community/community-paths';

/**
 * Ask, once a submission's page has opened in a browser, for the opening to
 * be counted as a view (CONTEXT.md, ADR-0029). It posts when the component
 * mounts and again only if the page comes to show another submission.
 *
 * The request is `keepalive`, so it is not cancelled when the reader leaves
 * at once: they opened the page, and that is a view. It is never aborted on
 * unmount for the same reason. A failed request is left alone; nothing on
 * the page depends on the answer, and the answer says nothing either way.
 *
 * In development React mounts a component twice, so this posts twice. The
 * server counts a viewer once a day, so the second changes nothing.
 *
 * @param submissionId - The submission whose page this is.
 */
export const useSubmissionViewBeacon = (submissionId: string): void => {
  useEffect(() => {
    fetch(submissionViewPath(submissionId), { method: 'POST', keepalive: true }).catch(() => {
      // Not counted this time. The page works the same without it.
    });
  }, [submissionId]);
};
