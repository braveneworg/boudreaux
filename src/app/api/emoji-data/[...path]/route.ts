/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { createHash } from 'node:crypto';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import emojiData from 'emojibase-data/en/data.json';
import emojiMessages from 'emojibase-data/en/messages.json';

interface ServedFile {
  body: string;
  etag: string;
}

const buildServedFile = (payload: unknown): ServedFile => {
  const body = JSON.stringify(payload);
  return { body, etag: `"${createHash('sha1').update(body).digest('hex')}"` };
};

/**
 * The emojibase JSON files frimousse requests for its `en` locale, bundled
 * into the server at build time (statically imported) so the picker never
 * reaches out to the jsdelivr CDN — which the site's CSP `connect-src`
 * rightly does not allow. Serialized and hashed once at module scope; the
 * ETag lets frimousse's HEAD revalidation reuse its localStorage cache.
 */
const EMOJI_DATA_FILES: Record<string, ServedFile> = {
  'en/data.json': buildServedFile(emojiData),
  'en/messages.json': buildServedFile(emojiMessages),
};

/**
 * GET /api/emoji-data/[...path]
 *
 * Same-origin data source for the frimousse emoji picker
 * (`emojibaseUrl="/api/emoji-data"`). Serves exactly the vendored
 * `{locale}/data.json` and `{locale}/messages.json` files; every other
 * path 404s. HEAD requests are derived from GET by Next.js, so
 * frimousse's ETag preflight works without a separate handler.
 */
export const GET = async (
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> => {
  const { path } = await context.params;
  const file = EMOJI_DATA_FILES[path.join('/')];
  if (!file) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return new NextResponse(file.body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      ETag: file.etag,
    },
  });
};
