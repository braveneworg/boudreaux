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

  it('extracts the commons category (P373)', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          entities: {
            Q1: {
              claims: { P373: [{ mainsnak: { datavalue: { value: 'Ceschi' } } }] },
              sitelinks: {},
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const data = await getWikidataData('Q1', fetchFn);
    expect(data.commonsCategory).toBe('Ceschi');
  });
});

describe('identity fields (video enrichment)', () => {
  it('extracts DOB with precision, birth name, aliases, label, and occupations', async () => {
    const entities = {
      entities: {
        Q123: {
          claims: {
            P569: [
              {
                mainsnak: {
                  datavalue: { value: { time: '+1985-03-15T00:00:00Z', precision: 11 } },
                },
              },
            ],
            P1477: [
              { mainsnak: { datavalue: { value: { text: 'Francisco Ramos', language: 'en' } } } },
            ],
            P106: [{ mainsnak: { datavalue: { value: { id: 'Q639669' } } } }],
          },
          labels: { en: { value: 'Ceschi' } },
          aliases: { en: [{ value: 'Ceschi Ramos' }] },
          sitelinks: {},
        },
      },
    };
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(entities)));

    const result = await getWikidataData('Q123', fetchFn);

    expect(result).toMatchObject({
      dateOfBirth: { value: '1985-03-15', precision: 11 },
      birthName: 'Francisco Ramos',
      aliases: ['Ceschi Ramos'],
      entityLabel: 'Ceschi',
      occupationIds: ['Q639669'],
    });
  });

  it('defaults the identity fields when the claims are absent', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ entities: { Q1: {} } })));

    const result = await getWikidataData('Q1', fetchFn);

    expect(result).toMatchObject({ aliases: [], occupationIds: [] });
  });
});
