/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { GET } from './route';

describe('GET /api/releases/[id]/download (legacy → 301 redirect)', () => {
  const makeRequest = () => new NextRequest('http://localhost/api/releases/release-123/download');
  const makeParams = () => ({ params: Promise.resolve({ id: 'release-123' }) });

  it('returns a 301 redirect to the release page', async () => {
    const response = await GET(makeRequest(), makeParams());

    expect(response.status).toBe(301);
    const location = response.headers.get('Location');
    expect(location).toBe('/releases/release-123');
  });

  it('does not perform any auth, purchase, or download checks', async () => {
    const response = await GET(makeRequest(), makeParams());

    // Just a simple redirect — no JSON body, no auth logic
    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe('/releases/release-123');
  });

  it('redirects to the correct release page for different release IDs', async () => {
    const request = new NextRequest('http://localhost/api/releases/abc-456/download');
    const params = { params: Promise.resolve({ id: 'abc-456' }) };

    const response = await GET(request, params);

    expect(response.status).toBe(301);
    expect(response.headers.get('Location')).toBe('/releases/abc-456');
  });
});
