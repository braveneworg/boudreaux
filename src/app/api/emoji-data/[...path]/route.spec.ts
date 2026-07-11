/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextRequest } from 'next/server';

import { GET } from './route';

vi.mock('server-only', () => ({}));

const getPath = async (segments: string[]): Promise<Response> => {
  const request = new NextRequest(`http://localhost/api/emoji-data/${segments.join('/')}`);
  return GET(request, { params: Promise.resolve({ path: segments }) });
};

describe('GET /api/emoji-data/[...path]', () => {
  it('serves the emojibase en emoji dataset with long-lived cache headers', async () => {
    const response = await getPath(['en', 'data.json']);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=86400, stale-while-revalidate=604800'
    );
    expect(response.headers.get('etag')).toBeTruthy();
    const body = (await response.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(1000);
  });

  it('serves the emojibase en messages (groups/skin tones) dataset', async () => {
    const response = await getPath(['en', 'messages.json']);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { groups?: unknown[]; skinTones?: unknown[] };
    expect(Array.isArray(body.groups)).toBe(true);
    expect(Array.isArray(body.skinTones)).toBe(true);
  });

  it('gives each file a distinct etag', async () => {
    const data = await getPath(['en', 'data.json']);
    const messages = await getPath(['en', 'messages.json']);

    expect(data.headers.get('etag')).not.toBe(messages.headers.get('etag'));
  });

  it('rejects locales that are not vendored', async () => {
    const response = await getPath(['fr', 'data.json']);
    expect(response.status).toBe(404);
  });

  it('rejects unknown files within a vendored locale', async () => {
    const response = await getPath(['en', 'shortcodes.json']);
    expect(response.status).toBe(404);
  });

  it('rejects paths with extra segments', async () => {
    const response = await getPath(['en', 'data.json', 'extra']);
    expect(response.status).toBe(404);
  });
});
