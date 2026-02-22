/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * 404 page for invalid release IDs at `/releases/[releaseId]`.
 * Displayed when `notFound()` is called from the release player page.
 */
import Link from 'next/link';

/**
 * Renders a "Release not found" message with a link back to the releases listing.
 */
const NotFoundPage = () => {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold text-zinc-900">Release Not Found</h1>
      <p className="text-zinc-500">
        Could not find the requested release. It may have been removed or the link may be incorrect.
      </p>
      <Link
        href="/releases"
        className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
      >
        Back to Releases
      </Link>
    </div>
  );
};

export default NotFoundPage;
