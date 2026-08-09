/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { resolveReleaseNotesSuggestion } from './release-notes.js';

import type { ReleaseNotesArgs, ReleaseNotesDeps } from './release-notes.js';
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
  notes: [
    'Broken Bone Ballads is the fourth solo album by Ceschi, written in the year he spent awaiting sentencing.',
    'The record pairs acoustic guitar with the rapid-fire cadence his live shows are built on.',
  ],
  sourceUrls: ['https://example.com/album'],
  rationale: 'The album page carries the writing history.',
};

const baseArgs: ReleaseNotesArgs = {
  title: 'Broken Bone Ballads',
  artistDisplay: 'Ceschi',
  releasedOn: '2015-03-03',
  formats: ['VINYL_12_INCH', 'DIGITAL'],
  catalogNumber: 'FF4-042',
  serperKey: 'serper-key',
  geminiKey: 'gemini-key',
  model: 'gemini-2.5-flash',
};

/** Deps with the page reader stubbed out so no test can touch the network. */
const withReader = (deps: ReleaseNotesDeps): ReleaseNotesDeps => ({
  readPage: vi.fn().mockResolvedValue(null),
  getScrapeKey: vi.fn().mockResolvedValue(null),
  ...deps,
});

describe('resolveReleaseNotesSuggestion', () => {
  it('synthesizes note paragraphs with subset-enforced sources', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi.fn().mockResolvedValue(
      geminiResponse({
        ...adjudication,
        sourceUrls: ['https://example.com/album', 'https://fabricated.example.com/'],
      })
    );

    const result = await resolveReleaseNotesSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn } })
    );

    expect(result).toEqual({
      value: adjudication.notes,
      confidence: 'medium',
      sources: [{ url: 'https://example.com/album' }],
      note: 'The album page carries the writing history.',
    });
  });

  it('sweeps three release-targeted queries, including liner notes', async () => {
    const searchWeb = vi.fn().mockResolvedValue([]);

    await resolveReleaseNotesSuggestion(baseArgs, withReader({ searchWeb }));

    expect(searchWeb).toHaveBeenCalledTimes(3);
    expect(searchWeb.mock.calls.map(([query]) => query)).toEqual([
      '"Ceschi" "Broken Bone Ballads" album',
      'Ceschi Broken Bone Ballads album review',
      'Ceschi Broken Bone Ballads liner notes',
    ]);
  });

  it('trims paragraphs and drops the blank ones', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue({
      ...adjudication,
      notes: ['  A real paragraph.  ', '   ', ''],
    });

    const result = await resolveReleaseNotesSuggestion(
      baseArgs,
      withReader({ searchWeb, requestJson })
    );

    expect(result?.value).toEqual(['A real paragraph.']);
  });

  it('returns null when Gemini returns null notes', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue({ ...adjudication, notes: null });

    const result = await resolveReleaseNotesSuggestion(
      baseArgs,
      withReader({ searchWeb, requestJson })
    );

    expect(result).toBeNull();
  });

  it('returns null when every paragraph is blank', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue({ ...adjudication, notes: ['   ', ''] });

    const result = await resolveReleaseNotesSuggestion(
      baseArgs,
      withReader({ searchWeb, requestJson })
    );

    expect(result).toBeNull();
  });

  it('returns null when the web search finds no evidence', async () => {
    const searchWeb = vi.fn().mockResolvedValue([]);

    const result = await resolveReleaseNotesSuggestion(baseArgs, withReader({ searchWeb }));

    expect(result).toBeNull();
  });

  it('returns null when every cited source was fabricated', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi
      .fn()
      .mockResolvedValue({ ...adjudication, sourceUrls: ['https://fabricated.example.com/'] });

    const result = await resolveReleaseNotesSuggestion(
      baseArgs,
      withReader({ searchWeb, requestJson })
    );

    expect(result).toBeNull();
  });

  it('fixes confidence at medium (the schema carries no confidence field)', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue({ ...adjudication, confidence: 'high' });

    const result = await resolveReleaseNotesSuggestion(
      baseArgs,
      withReader({ searchWeb, requestJson })
    );

    expect(result?.confidence).toBe('medium');
  });

  it('returns null instead of throwing when the adjudication call fails', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi.fn().mockRejectedValue(new Error('gemini down'));

    const result = await resolveReleaseNotesSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn, retries: 0 } })
    );

    expect(result).toBeNull();
  });

  it('asks for short paragraphs that name the artist', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    await resolveReleaseNotesSuggestion(baseArgs, withReader({ searchWeb, requestJson }));

    const [, options] = requestJson.mock.calls[0];
    expect(options.systemPrompt).toContain('two or three');
    expect(options.systemPrompt).toContain("mention the artist's name");
  });

  it('demands verbatim quotes with inline source attribution, never fabricated', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    await resolveReleaseNotesSuggestion(baseArgs, withReader({ searchWeb, requestJson }));

    const [, options] = requestJson.mock.calls[0];
    expect(options.systemPrompt).toContain('verbatim');
    expect(options.systemPrompt).toContain('attributed inline');
    expect(options.systemPrompt).toMatch(/never invent, alter/i);
  });

  it('gives the model the release date, catalog number, and formats as context', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    await resolveReleaseNotesSuggestion(baseArgs, withReader({ searchWeb, requestJson }));

    const [, options] = requestJson.mock.calls[0];
    expect(options.userPrompt).toContain('2015-03-03');
    expect(options.userPrompt).toContain('FF4-042');
    expect(options.userPrompt).toContain('Vinyl 12 Inch');
  });

  it('omits the optional context lines when the release carries none', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    await resolveReleaseNotesSuggestion(
      {
        title: 'Untitled',
        artistDisplay: 'Ceschi',
        serperKey: 'serper-key',
        geminiKey: 'gemini-key',
      },
      withReader({ searchWeb, requestJson })
    );

    const [, options] = requestJson.mock.calls[0];
    expect(options.userPrompt).not.toContain('Catalog number');
    expect(options.userPrompt).not.toContain('Formats');
  });

  it('feeds top-page excerpts into the prompt as quote material', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);
    const readPage = vi.fn().mockResolvedValue({
      content: 'Pitchfork called the record "a jagged little miracle".',
      images: [],
    });
    const getScrapeKey = vi.fn().mockResolvedValue('jina-key');

    await resolveReleaseNotesSuggestion(baseArgs, {
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
