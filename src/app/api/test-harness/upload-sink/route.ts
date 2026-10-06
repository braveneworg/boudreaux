/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextResponse, type NextRequest } from 'next/server';

import {
  isLocalUpload,
  localReadObject,
  localStoreObject,
} from '@/lib/actions/upload-local-adapter';

/**
 * E2E-only sink for single-PUT presigned uploads (see
 * `upload-local-adapter.ts`): PUT stores the object, GET serves it back.
 * 404 unless `E2E_MODE` is on.
 */

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export const PUT = async (request: NextRequest): Promise<NextResponse> => {
  if (!isLocalUpload()) return new NextResponse(null, { status: 404 });

  const key = request.nextUrl.searchParams.get('key');
  const body = await request.arrayBuffer();
  const contentType = request.headers.get('content-type') ?? 'application/octet-stream';
  if (!key || !localStoreObject(key, { body, contentType })) {
    return new NextResponse(null, { status: 400, headers: NO_STORE });
  }
  return new NextResponse(null, { status: 200, headers: NO_STORE });
};

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  if (!isLocalUpload()) return new NextResponse(null, { status: 404 });

  const key = request.nextUrl.searchParams.get('key');
  const object = key ? localReadObject(key) : null;
  if (!object) return new NextResponse(null, { status: 404, headers: NO_STORE });
  return new NextResponse(object.body, {
    status: 200,
    headers: { ...NO_STORE, 'Content-Type': object.contentType },
  });
};
