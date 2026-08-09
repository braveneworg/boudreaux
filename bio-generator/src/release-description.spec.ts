/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { resolveReleaseDescriptionSuggestion } from './release-description.js';

import type { ReleaseDescriptionArgs, ReleaseDescriptionDeps } from './release-description.js';
import type { SerperWebResult } from './serper.js';

const evidence: SerperWebResult[] = [
  {
    title: 'Ceschi — Broken Bone Ballads',
    link: 'https://example.com/album',
    snippet: 'The 2015 album from the Fake Four co-founder.',
    date: 'Mar 3, 2015',
  },
];

/** A Gemini generateContent response whose single part is `json`. */
const geminiResponse = (json: unknown): Response =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] })
  );

const adjudication = {
  description: 'Broken Bone Ballads is the fourth solo album by Ceschi, written under sentence.',
  sourceUrls: ['https://example.com/album'],
  rationale: 'The album page carries the writing history.',
};

const baseArgs: ReleaseDescriptionArgs = {
  title: 'Broken Bone Ballads',
  artistDisplay: 'Ceschi',
  releasedOn: '2015-03-03',
  formats: ['VINYL_12_INCH', 'DIGITAL'],
  catalogNumber: 'FF4-042',
  labelNotes: [],
  serperKey: 'serper-key',
  geminiKey: 'gemini-key',
  model: 'gemini-2.5-flash',
};

/** Deps with the page reader stubbed out so no test can touch the network. */
const withReader = (deps: ReleaseDescriptionDeps): ReleaseDescriptionDeps => ({
  readPage: vi.fn().mockResolvedValue(null),
  getScrapeKey: vi.fn().mockResolvedValue(null),
  ...deps,
});

describe('resolveReleaseDescriptionSuggestion', () => {
  it('synthesizes a blurb with subset-enforced sources', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi.fn().mockResolvedValue(
      geminiResponse({
        ...adjudication,
        sourceUrls: ['https://example.com/album', 'https://fabricated.example.com/'],
      })
    );

    const result = await resolveReleaseDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn } })
    );

    expect(result).toEqual({
      value: adjudication.description,
      confidence: 'medium',
      sources: [{ url: 'https://example.com/album' }],
      note: 'The album page carries the writing history.',
    });
  });

  it('sweeps three release-targeted queries when the label has no notes', async () => {
    const searchWeb = vi.fn().mockResolvedValue([]);

    await resolveReleaseDescriptionSuggestion(baseArgs, withReader({ searchWeb }));

    expect(searchWeb).toHaveBeenCalledTimes(3);
    expect(searchWeb.mock.calls.map(([query]) => query)).toEqual([
      '"Ceschi" "Broken Bone Ballads" album',
      'Ceschi Broken Bone Ballads album review',
      'Ceschi Broken Bone Ballads liner notes',
    ]);
  });

  it('adds a fourth search seeded from the label notes, to corroborate them', async () => {
    const searchWeb = vi.fn().mockResolvedValue([]);

    await resolveReleaseDescriptionSuggestion(
      {
        ...baseArgs,
        labelNotes: [
          'Recorded at home in New Haven during the year Ceschi awaited sentencing. Mixed later.',
          'A second note that should not seed the search.',
        ],
      },
      withReader({ searchWeb })
    );

    expect(searchWeb).toHaveBeenCalledTimes(4);
    // First sentence of the first note, capped, prefixed by the artist.
    expect(searchWeb.mock.calls[3][0]).toBe(
      'Ceschi Recorded at home in New Haven during the year Ceschi'
    );
  });

  it('feeds the label notes into the prompt as authoritative facts', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    await resolveReleaseDescriptionSuggestion(
      { ...baseArgs, labelNotes: ['Cut live to tape.', 'Sleeve screened by hand.'] },
      withReader({ searchWeb, requestJson })
    );

    const [, options] = requestJson.mock.calls[0];
    expect(options.userPrompt).toContain('LABEL NOTES');
    expect(options.userPrompt).toContain('- Cut live to tape.');
    expect(options.userPrompt).toContain('- Sleeve screened by hand.');
    expect(options.systemPrompt).toMatch(/label notes are authoritative/i);
  });

  it('omits the label-notes block entirely when there are none', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    await resolveReleaseDescriptionSuggestion(baseArgs, withReader({ searchWeb, requestJson }));

    const [, options] = requestJson.mock.calls[0];
    expect(options.userPrompt).not.toContain('LABEL NOTES');
  });

  it('asks for about 500 characters and requires the artist name', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    await resolveReleaseDescriptionSuggestion(baseArgs, withReader({ searchWeb, requestJson }));

    const [, options] = requestJson.mock.calls[0];
    expect(options.systemPrompt).toContain('about 500 characters');
    expect(options.systemPrompt).toContain("mention the artist's name");
  });

  it('demands verbatim quotes with inline source attribution, never fabricated', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    await resolveReleaseDescriptionSuggestion(baseArgs, withReader({ searchWeb, requestJson }));

    const [, options] = requestJson.mock.calls[0];
    expect(options.systemPrompt).toContain('verbatim');
    expect(options.systemPrompt).toContain('attributed inline');
    expect(options.systemPrompt).toMatch(/never invent, alter/i);
  });

  it('returns null when Gemini returns a null description', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue({ ...adjudication, description: null });

    const result = await resolveReleaseDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, requestJson })
    );

    expect(result).toBeNull();
  });

  it('returns null when the description is empty after trimming', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue({ ...adjudication, description: '   ' });

    const result = await resolveReleaseDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, requestJson })
    );

    expect(result).toBeNull();
  });

  it('returns null when the web search finds no evidence', async () => {
    const searchWeb = vi.fn().mockResolvedValue([]);

    const result = await resolveReleaseDescriptionSuggestion(baseArgs, withReader({ searchWeb }));

    expect(result).toBeNull();
  });

  it('returns null when every cited source was fabricated and no label notes ground it', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi
      .fn()
      .mockResolvedValue({ ...adjudication, sourceUrls: ['https://fabricated.example.com/'] });

    const result = await resolveReleaseDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, requestJson })
    );

    expect(result).toBeNull();
  });

  it('keeps a source-less blurb when the label notes are its grounding', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue({ ...adjudication, sourceUrls: [] });

    const result = await resolveReleaseDescriptionSuggestion(
      { ...baseArgs, labelNotes: ['Cut live to tape.'] },
      withReader({ searchWeb, requestJson })
    );

    expect(result?.value).toBe(adjudication.description);
    expect(result?.sources).toEqual([]);
  });

  it('fixes confidence at medium (the schema carries no confidence field)', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue({ ...adjudication, confidence: 'high' });

    const result = await resolveReleaseDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, requestJson })
    );

    expect(result?.confidence).toBe('medium');
  });

  it('returns null instead of throwing when the adjudication call fails', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi.fn().mockRejectedValue(new Error('gemini down'));

    const result = await resolveReleaseDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn, retries: 0 } })
    );

    expect(result).toBeNull();
  });

  it('gives the model the release date, catalog number, and formats as context', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    await resolveReleaseDescriptionSuggestion(baseArgs, withReader({ searchWeb, requestJson }));

    const [, options] = requestJson.mock.calls[0];
    expect(options.userPrompt).toContain('2015-03-03');
    expect(options.userPrompt).toContain('FF4-042');
    expect(options.userPrompt).toContain('Vinyl 12 Inch');
  });

  it('feeds top-page excerpts into the prompt as quote material', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);
    const readPage = vi.fn().mockResolvedValue({
      content: 'Pitchfork called the record "a jagged little miracle".',
      images: [],
    });
    const getScrapeKey = vi.fn().mockResolvedValue('jina-key');

    await resolveReleaseDescriptionSuggestion(baseArgs, {
      searchWeb,
      requestJson,
      readPage,
      getScrapeKey,
    });

    expect(readPage).toHaveBeenCalledWith(
      'https://example.com/album',
      'jina-key',
      undefined,
      expect.anything()
    );
    const [, options] = requestJson.mock.calls[0];
    expect(options.userPrompt).toContain('PAGE EXCERPTS');
    expect(options.userPrompt).toContain('a jagged little miracle');
  });
});
