/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useEffect, useRef } from 'react';

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
 * One mount posts once, also in development, where React runs a mounted
 * component's effects twice. The ref outlives that replay, so the second run
 * finds the request already made. It matters beyond tidiness: two requests
 * at once from a guest with no visitor cookie yet are identified as two
 * visitors, and one opening would be counted under both.
 *
 * @param submissionId - The submission whose page this is.
 */
export const useSubmissionViewBeacon = (submissionId: string): void => {
  const askedFor = useRef<string | null>(null);

  useEffect(() => {
    if (askedFor.current === submissionId) {
      return;
    }
    askedFor.current = submissionId;

    fetch(submissionViewPath(submissionId), { method: 'POST', keepalive: true }).catch(() => {
      // Not counted this time. The page works the same without it.
    });
  }, [submissionId]);
};
