/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GET } from './route';

describe('GET /api/releases/[id]/download (legacy → 301 redirect)', () => {
  it("returns a 301 redirect to the buyer's collection", async () => {
    const response = await GET();

    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe('/collection');
  });

  it('does not perform any auth, purchase, or download checks', async () => {
    const response = await GET();

    // Just a simple redirect — no body, no auth logic
    expect(response.body).toBeNull();
  });
});
