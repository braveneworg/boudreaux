// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { GET, PUT } from './route';

vi.mock('server-only', () => ({}));

let keyCounter = 0;
const nextKey = (): string => {
  keyCounter += 1;
  return `media/videos/cccccccccccccccccccccccc/sink-${keyCounter}.jpg`;
};

const sinkUrl = (key: string | null): URL => {
  const url = new URL('http://127.0.0.1:3099/api/test-harness/upload-sink');
  if (key !== null) url.searchParams.set('key', key);
  return url;
};

const put = (key: string | null, body = 'jpeg-bytes', contentType = 'image/jpeg') =>
  PUT(
    new NextRequest(sinkUrl(key), {
      method: 'PUT',
      body,
      headers: { 'content-type': contentType },
    })
  );

const get = (key: string | null) => GET(new NextRequest(sinkUrl(key)));

beforeEach(() => {
  vi.stubEnv('E2E_MODE', 'true');
});

describe('/api/test-harness/upload-sink — production gate', () => {
  it('404s both methods when E2E_MODE is not enabled', async () => {
    vi.stubEnv('E2E_MODE', '');
    const key = nextKey();

    expect((await put(key)).status).toBe(404);
    expect((await get(key)).status).toBe(404);
  });
});

describe('/api/test-harness/upload-sink — round trip', () => {
  it('serves back the bytes and type a PUT stored', async () => {
    const key = nextKey();

    expect((await put(key, 'poster-bytes', 'image/jpeg')).status).toBe(200);
    const response = await get(key);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(await response.text()).toBe('poster-bytes');
  });

  it('404s a key nothing was uploaded to', async () => {
    expect((await get(nextKey())).status).toBe(404);
  });

  it('refuses a key outside media/', async () => {
    expect((await put('../etc/passwd')).status).toBe(400);
    expect((await put(null)).status).toBe(400);
  });
});
