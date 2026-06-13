/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Standard shape for a single page of a skip/offset–paginated list endpoint.
 *
 * `nextSkip` is the `skip` value to request for the following page, or `null`
 * when the last page has been reached. Consume with TanStack `useInfiniteQuery`:
 * `getNextPageParam: (lastPage) => lastPage.nextSkip`.
 */
export interface PaginatedResponse<T> {
  rows: T[];
  nextSkip: number | null;
}

/**
 * Computes the `nextSkip` cursor for a skip/offset page.
 *
 * Returns the next offset (`skip + take`) when a full page was returned, and
 * `null` once a short page signals the end of the list.
 *
 * @param returned - Number of rows actually returned for this page.
 * @param skip - The offset that produced this page.
 * @param take - The page size that was requested.
 */
export const computeNextSkip = (returned: number, skip: number, take: number): number | null =>
  returned === take ? skip + take : null;
