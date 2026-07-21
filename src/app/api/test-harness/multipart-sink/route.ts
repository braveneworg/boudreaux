/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse, type NextRequest } from 'next/server';

import { isLocalMultipartUpload, localRecordPart } from '@/lib/actions/multipart-local-adapters';
import { VIDEO_PART_SIZE } from '@/lib/constants/video-uploads';

/**
 * The local stand-in for the S3 endpoint a presigned part URL points at.
 *
 * Exists so the browser uploader can genuinely PUT its part slices under E2E
 * instead of being short-circuited: it takes delivery of one part body and
 * answers with an `ETag` response header, which is the only thing the uploader
 * reads back from a part upload.
 *
 * SECURITY — this is HTTP surface, so it is gated three ways:
 *
 * 1. Hard-gated on `E2E_MODE`. Without it the route 404s before touching the
 *    request, so in production it is indistinguishable from a path that does
 *    not exist. Turning the flag on in a real production deploy is itself
 *    already refused: `src/lib/auth.ts` throws at boot on
 *    `E2E_MODE + NODE_ENV=production` (unless env validation is deliberately
 *    skipped, which only the CI E2E standalone server does).
 * 2. Only an upload id minted by `initiateVideoUploadAction` — which is behind
 *    `requireRole('admin')` and Zod validation — is accepted; anything else
 *    409s. That unguessable id is the analogue of the presigned signature the
 *    real S3 endpoint checks, which likewise carries no session.
 * 3. Nothing is accepted or persisted beyond what the flow needs: the body is
 *    measured and digested, then discarded. No bytes reach disk, the DB, or any
 *    response; the S3 key is never taken from the request, only looked up from
 *    the upload the admin-gated action created.
 */

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

interface SinkParams {
  uploadId: string;
  partNumber: number;
}

/** The upload id and 1-based part number, or `null` when either is unusable. */
const parseSinkParams = (url: URL): SinkParams | null => {
  const uploadId = url.searchParams.get('uploadId');
  const partNumber = Number(url.searchParams.get('partNumber'));
  if (!uploadId || !Number.isInteger(partNumber) || partNumber < 1) return null;
  return { uploadId, partNumber };
};

/**
 * Whether the declared body exceeds one part, checked before the body is read
 * so an oversized request is refused rather than buffered.
 */
const exceedsPartSize = (request: NextRequest): boolean =>
  Number(request.headers.get('content-length') ?? 0) > VIDEO_PART_SIZE;

export const PUT = async (request: NextRequest): Promise<NextResponse> => {
  if (!isLocalMultipartUpload()) return new NextResponse(null, { status: 404 });

  const params = parseSinkParams(request.nextUrl);
  if (!params) return new NextResponse(null, { status: 400, headers: NO_STORE });
  if (exceedsPartSize(request)) return new NextResponse(null, { status: 413, headers: NO_STORE });

  const body = new Uint8Array(await request.arrayBuffer());
  const eTag = localRecordPart({ ...params, body });
  if (eTag === null) return new NextResponse(null, { status: 409, headers: NO_STORE });

  return new NextResponse(null, { status: 200, headers: { ...NO_STORE, ETag: eTag } });
};
