/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getWikidataData } from './wikidata.js';

const entityResponse = (entity: unknown): Response =>
  new Response(JSON.stringify({ entities: { Q11649: entity } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('getWikidataData', () => {
  it('extracts P18 image file names, official site, and Wikipedia URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      entityResponse({
        claims: {
          P18: [{ mainsnak: { datavalue: { value: 'Radiohead 2008.jpg' } } }],
          P856: [{ mainsnak: { datavalue: { value: 'https://radiohead.com' } } }],
        },
        sitelinks: { enwiki: { url: 'https://en.wikipedia.org/wiki/Radiohead' } },
      })
    );

    const result = await getWikidataData('Q11649', fetchFn);

    expect(result.imageFileNames).toEqual(['Radiohead 2008.jpg']);
    expect(result.officialUrl).toBe('https://radiohead.com');
    expect(result.wikipediaUrl).toBe('https://en.wikipedia.org/wiki/Radiohead');
  });

  it('returns empty arrays when claims are absent', async () => {
    const fetchFn = vi.fn().mockResolvedValue(entityResponse({}));

    const result = await getWikidataData('Q11649', fetchFn);

    expect(result.imageFileNames).toEqual([]);
  });

  it('throws when Wikidata returns a non-OK status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));

    await expect(getWikidataData('Q11649', fetchFn)).rejects.toThrow('Wikidata request failed');
  });
});
