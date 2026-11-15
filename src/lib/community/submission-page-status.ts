/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The status of a submission's page, `/community/<id>`, answered by the
 * proxy.
 *
 * The page sits under the root loading boundary, which streams a `200`
 * before `notFound()` can set the status, so the page alone can only render
 * the not-found page under a `200`. A search engine would index that. The
 * proxy decides first: a signed-out request for anything that is not a
 * public submission is rewritten in place under a `404`, and the page then
 * renders the themed not-found page with that status.
 *
 * A request that carries a session cookie always goes on to the page, which
 * decides for that reader (an owner opens their own draft). The proxy must
 * not answer it by whether the id exists: "no such submission" as a `404`
 * beside "exists, not yours" as a `200` would tell a signed-in prober which
 * ids are real. So the two cases are one answer to a signed-out reader
 * (`404`) and one answer to a signed-in reader (the page's `200`).
 */
import 'server-only';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { SubmissionService } from '@/lib/services/submission-service';
import { loggers } from '@/lib/utils/logger';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

// One path segment after `/community` — never the community page itself,
// and never a submission's edit page.
const COMMUNITY_SEGMENT_PATH = /^\/community\/([^/]+)$/;

/** The one-segment community pages that are not a submission's: the form and the owner's list. */
const OTHER_PAGES: ReadonlySet<string> = new Set(['submit', 'mine']);

/** The segment in a `/community/<segment>` path, or `null` for any other path. */
export const communityPageSegment = (pathname: string): string | null =>
  COMMUNITY_SEGMENT_PATH.exec(pathname)?.[1] ?? null;

/** Whether a segment names a public submission. A failed read answers yes: the page decides. */
const namesPublicSubmission = async (segment: string): Promise<boolean> => {
  if (!isValidObjectId(segment)) {
    return false;
  }

  try {
    return await SubmissionService.isPublic(segment);
  } catch (error) {
    // Never take a public page down from the proxy: let the page answer.
    loggers.media.error('Submission page status read failed', error);

    return true;
  }
};

/**
 * The proxy's answer for `/community/<segment>`: on to the page, or a
 * rewrite in place under a `404` for a signed-out request whose segment is
 * not a public submission. The form and the owner's list are never a `404`
 * here. The proxy sends a signed-out visitor to them to sign in before it
 * asks this, and their pages check again; this only makes sure the two can
 * never be taken for a submission's id.
 *
 * @param hasSession - Whether the request carries a session cookie. Presence
 * only: the page makes the authoritative check.
 */
export const submissionPageResponse = async (
  request: NextRequest,
  segment: string,
  hasSession: boolean
): Promise<NextResponse> => {
  if (hasSession || OTHER_PAGES.has(segment) || (await namesPublicSubmission(segment))) {
    return NextResponse.next();
  }

  return NextResponse.rewrite(request.nextUrl, { status: 404 });
};
