/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import LegacyReleasePage from './page';

// Like Next's own, the mock throws: nothing after it runs.
const notFound = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  notFound: () => {
    notFound();
    throw new Error('NEXT_NOT_FOUND');
  },
}));

describe('LegacyReleasePage', () => {
  it("renders the segment's not-found page", () => {
    expect(() => LegacyReleasePage()).toThrow('NEXT_NOT_FOUND');

    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
