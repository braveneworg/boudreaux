/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Legacy release URL `/releases/[releaseId]`.
 *
 * The proxy answers it first (`src/lib/legacy-release-url.ts`): a release
 * with a deep link is a `308` there, and any other id is rewritten back here
 * under a `404`. So this page only renders the segment's not-found page.
 */

import { notFound } from 'next/navigation';

export default function LegacyReleasePage(): never {
  notFound();
}
