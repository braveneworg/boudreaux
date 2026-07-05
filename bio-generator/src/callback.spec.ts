/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { postBioCallback } from './callback.js';

import type { BioGenerationResult } from './types.js';

const result: BioGenerationResult = {
  ok: true,
  data: {
    shortBio: 's',
    longBio: 'l',
    altBio: 'a',
    genres: 'rock',
    images: [],
    links: [],
    model: 'gemini-2.5-flash',
  },
};

const okResponse = (): Response => new Response('ok', { status: 200 });

describe('postBioCallback', () => {
  it('POSTs to the callback url', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioCallback({ url: 'https://app.example/cb', jobToken: 'tok-1', result }, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith('https://app.example/cb', expect.anything());
  });

  it('uses the POST method', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioCallback({ url: 'https://app.example/cb', jobToken: 'tok-1', result }, fetchFn);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
  });

  it('sends the jobToken and result as the JSON body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioCallback({ url: 'https://app.example/cb', jobToken: 'tok-1', result }, fetchFn);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ jobToken: 'tok-1', result });
  });

  it('sends a JSON content-type header', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioCallback({ url: 'https://app.example/cb', jobToken: 'tok-1', result }, fetchFn);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
  });

  it('does not throw when the callback responds non-ok', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('bad', { status: 500 }));

    await expect(
      postBioCallback({ url: 'https://app.example/cb', jobToken: 'tok-1', result }, fetchFn)
    ).resolves.toBeUndefined();
  });

  it('does not throw when the fetch itself rejects', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(
      postBioCallback({ url: 'https://app.example/cb', jobToken: 'tok-1', result }, fetchFn)
    ).resolves.toBeUndefined();
  });
});
