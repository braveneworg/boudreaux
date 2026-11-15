/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Legacy submission URL `/community/<id>`, answered by the proxy.
 *
 * A submission is no longer a page of its own: it opens in the submission
 * modal (ADR-0030). The old URL stays only to keep the links already sent
 * and shared working: it permanently redirects to the submission deep link,
 * `/community?submission=<id>`.
 *
 * Every well-formed id is redirected, whether or not it names a submission
 * and whoever asks, so the redirect reads nothing and reveals nothing. Who
 * may open the submission is decided where the deep link lands, for that
 * reader.
 *
 * The proxy, not a page, decides: a page here would render under the root
 * loading boundary, which streams a `200` before a redirect can set the
 * status.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { submissionDeepLink } from '@/lib/community/community-paths';
import { isValidObjectId } from '@/lib/utils/validation/object-id';

// One path segment after `/community` — never the community page itself,
// and never a submission's edit page.
const COMMUNITY_SEGMENT_PATH = /^\/community\/([^/]+)$/;

/** The segment in a `/community/<segment>` path, or `null` for any other path. */
export const communityPageSegment = (pathname: string): string | null =>
  COMMUNITY_SEGMENT_PATH.exec(pathname)?.[1] ?? null;

/**
 * The proxy's answer for `/community/<segment>`: a `308` to the submission
 * deep link when the segment is an id, and on to the router otherwise. The
 * form and the owner's list are such segments and go on to their pages; the
 * proxy has already sent a signed-out visitor to them to sign in. Anything
 * else has no page, and the router answers its own `404`.
 */
export const legacySubmissionResponse = (request: NextRequest, segment: string): NextResponse =>
  isValidObjectId(segment)
    ? NextResponse.redirect(new URL(submissionDeepLink(segment), request.nextUrl), 308)
    : NextResponse.next();
