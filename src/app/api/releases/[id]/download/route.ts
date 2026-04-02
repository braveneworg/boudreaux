/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * GET /api/releases/[id]/download
 *
 * DEPRECATED: This legacy route now permanently redirects (301) to the
 * release page where users can access the format-specific bundle download
 * via the download dialog. This preserves existing email links and bookmarks.
 *
 * Replaced by: /api/releases/[id]/download/bundle (format-specific ZIP streaming)
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: releaseId } = await params;

  return new Response(null, {
    status: 301,
    headers: { Location: `/releases/${releaseId}` },
  });
}
