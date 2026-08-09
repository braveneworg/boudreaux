/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { resolveDescriptionSuggestion } from './video-description.js';

import type { SerperWebResult } from './serper.js';
import type { VideoDescriptionDeps, VideoDescriptionArgs } from './video-description.js';

const { logEvent } = vi.hoisted(() => ({ logEvent: vi.fn() }));

vi.mock('./lib/log.js', () => ({
  logEvent,
  toErrorMessage: (err: unknown) => String(err),
}));

beforeEach(() => {
  logEvent.mockClear();
});

const evidence: SerperWebResult[] = [
  {
    title: 'Ceschi — Bite Through Stone',
    link: 'https://example.com/song',
    snippet: 'A single from the album Broken Bone Ballads.',
    date: 'Apr 9, 2021',
  },
];

/** A Gemini generateContent response whose single part is `json`. */
const geminiResponse = (json: unknown): Response =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] })
  );

const adjudication = {
  description: 'Bite Through Stone is a single by Ceschi from Broken Bone Ballads.',
  sourceUrls: ['https://example.com/song'],
  rationale: 'The album page names the single.',
};

const baseArgs: VideoDescriptionArgs = {
  title: 'Bite Through Stone',
  artistDisplay: 'Ceschi',
  releasedOn: '2021-04-09',
  facts: ['Credited artists: Ceschi.', 'MusicBrainz first-release date: 2021-04-09.'],
  serperKey: 'serper-key',
  geminiKey: 'gemini-key',
  model: 'gemini-2.5-flash',
};

/** Deps with the page reader stubbed out so no test can touch the network. */
const withReader = (deps: VideoDescriptionDeps): VideoDescriptionDeps => ({
  readPage: vi.fn().mockResolvedValue(null),
  getScrapeKey: vi.fn().mockResolvedValue(null),
  ...deps,
});

describe('resolveDescriptionSuggestion', () => {
  it('synthesizes a suggestion with subset-enforced sources', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi.fn().mockResolvedValue(
      geminiResponse({
        ...adjudication,
        sourceUrls: ['https://example.com/song', 'https://fabricated.example.com/'],
      })
    );

    const result = await resolveDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn } })
    );

    expect(result).toEqual({
      value: 'Bite Through Stone is a single by Ceschi from Broken Bone Ballads.',
      confidence: 'medium',
      sources: [{ url: 'https://example.com/song' }],
      note: 'The album page names the single.',
    });
  });

  it('sweeps three queries, including a review search for quotable press', async () => {
    const searchWeb = vi.fn().mockResolvedValue([]);

    await resolveDescriptionSuggestion(baseArgs, withReader({ searchWeb }));

    expect(searchWeb).toHaveBeenCalledTimes(3);
    expect(searchWeb.mock.calls.map(([query]) => query)).toEqual([
      '"Ceschi" "Bite Through Stone"',
      'Ceschi Bite Through Stone song',
      'Ceschi Bite Through Stone review',
    ]);
  });

  it('returns null when Gemini returns a null description', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(geminiResponse({ ...adjudication, description: null }));

    const result = await resolveDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn } })
    );

    expect(result).toBeNull();
  });

  it('returns null when the description is empty after trimming', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(geminiResponse({ ...adjudication, description: '   ' }));

    const result = await resolveDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn } })
    );

    expect(result).toBeNull();
  });

  it('returns null when the web search finds no evidence', async () => {
    const searchWeb = vi.fn().mockResolvedValue([]);

    const result = await resolveDescriptionSuggestion(baseArgs, withReader({ searchWeb }));

    expect(result).toBeNull();
  });

  it('returns null when every cited source was fabricated', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        geminiResponse({ ...adjudication, sourceUrls: ['https://fabricated.example.com/'] })
      );

    const result = await resolveDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn } })
    );

    expect(result).toBeNull();
  });

  it('fixes confidence at medium (the schema carries no confidence field)', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue({ ...adjudication, confidence: 'high' });

    const result = await resolveDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, requestJson })
    );

    expect(result?.confidence).toBe('medium');
  });

  it('returns null instead of throwing when the adjudication call fails', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi.fn().mockRejectedValue(new Error('gemini down'));

    const result = await resolveDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn, retries: 0 } })
    );

    expect(result).toBeNull();
  });

  it('embeds the provided facts lines in the user prompt', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    await resolveDescriptionSuggestion(baseArgs, withReader({ searchWeb, requestJson }));

    const [, options] = requestJson.mock.calls[0];
    expect(options.userPrompt).toContain('- Credited artists: Ceschi.');
    expect(options.userPrompt).toContain('- MusicBrainz first-release date: 2021-04-09.');
  });

  it('sends the no-visual-claims instruction in the system prompt', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    await resolveDescriptionSuggestion(baseArgs, withReader({ searchWeb, requestJson }));

    const [, options] = requestJson.mock.calls[0];
    expect(options.systemPrompt).toContain('NEVER describe visuals or events in the video itself.');
  });

  it('targets about 500 characters and requires the artist name in the prose', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    await resolveDescriptionSuggestion(baseArgs, withReader({ searchWeb, requestJson }));

    const [, options] = requestJson.mock.calls[0];
    expect(options.systemPrompt).toContain('about 500 characters');
    expect(options.systemPrompt).toContain("mention the artist's name");
  });

  it('demands verbatim quotes with inline source attribution, never fabricated', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    await resolveDescriptionSuggestion(baseArgs, withReader({ searchWeb, requestJson }));

    const [, options] = requestJson.mock.calls[0];
    expect(options.systemPrompt).toContain('verbatim');
    expect(options.systemPrompt).toContain('attributed inline');
    expect(options.systemPrompt).toMatch(/never invent, alter/i);
  });

  it('feeds top-page excerpts into the prompt as quote material', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);
    const readPage = vi.fn().mockResolvedValue({
      content: 'Pitchfork called the single "a jagged little miracle".',
      images: [],
    });
    const getScrapeKey = vi.fn().mockResolvedValue('jina-key');

    await resolveDescriptionSuggestion(baseArgs, {
      searchWeb,
      requestJson,
      readPage,
      getScrapeKey,
    });

    expect(readPage).toHaveBeenCalledWith(
      'https://example.com/song',
      'jina-key',
      undefined,
      expect.anything()
    );
    const [, options] = requestJson.mock.calls[0];
    expect(options.userPrompt).toContain('PAGE EXCERPTS');
    expect(options.userPrompt).toContain('[https://example.com/song]');
    expect(options.userPrompt).toContain('a jagged little miracle');
  });

  it('caps page reads at two and drops the block when every read fails', async () => {
    const threeResults: SerperWebResult[] = [
      evidence[0],
      { title: 'Review', link: 'https://example.com/review', snippet: 'Review page.' },
      { title: 'Interview', link: 'https://example.com/interview', snippet: 'Interview page.' },
    ];
    const searchWeb = vi.fn().mockResolvedValue(threeResults);
    const requestJson = vi.fn().mockResolvedValue(adjudication);
    const readPage = vi.fn().mockResolvedValue(null);

    await resolveDescriptionSuggestion(baseArgs, withReader({ searchWeb, requestJson, readPage }));

    expect(readPage).toHaveBeenCalledTimes(2);
    const [, options] = requestJson.mock.calls[0];
    expect(options.userPrompt).not.toContain('PAGE EXCERPTS');
  });

  it('keeps a description at the 900-char cap untouched', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const atCap = `${'A'.repeat(899)}.`;
    const fetchFn = vi
      .fn()
      .mockResolvedValue(geminiResponse({ ...adjudication, description: atCap }));

    const result = await resolveDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn } })
    );

    expect(result?.value).toBe(atCap);
  });

  it('truncates an overlong description at the last whole sentence', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const first = `${'A'.repeat(500)}.`;
    const second = `${'B'.repeat(300)}.`;
    const third = `${'C'.repeat(200)}.`;
    const fetchFn = vi.fn().mockResolvedValue(
      // 1005 chars — the third sentence pushes it past the 900-char cap.
      geminiResponse({ ...adjudication, description: `${first} ${second} ${third}` })
    );

    const result = await resolveDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn } })
    );

    expect(result?.value).toBe(`${first} ${second}`);
  });

  it('drops a trailing quote rather than orphaning it from its attribution', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const opening = `${'A'.repeat(600)}.`;
    // The sentence ends inside the quote, but " — Pitchfork" continues it —
    // cutting at that terminator would publish the quote with no source.
    const quoted = 'Critics called it "a jagged little miracle." — Pitchfork';
    const fetchFn = vi.fn().mockResolvedValue(
      geminiResponse({
        ...adjudication,
        description: `${opening} ${quoted} ${'B'.repeat(400)}`,
      })
    );

    const result = await resolveDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn } })
    );

    expect(result?.value).toBe(opening);
  });

  it('hard-cuts an overlong description that offers no sentence boundary', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(geminiResponse({ ...adjudication, description: 'D'.repeat(1000) }));

    const result = await resolveDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn } })
    );

    expect(result?.value).toBe('D'.repeat(900));
  });

  it('logs how much prose a truncation discarded', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(geminiResponse({ ...adjudication, description: 'D'.repeat(1000) }));

    await resolveDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn } })
    );

    expect(logEvent).toHaveBeenCalledWith(
      'warn',
      'description_truncated',
      expect.objectContaining({ length: 1000, cap: 900, kept: 900 })
    );
  });

  it('logs the shorter kept length when a sentence backoff drops a quote', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const opening = `${'A'.repeat(600)}.`;
    const quoted = 'Critics called it "a jagged little miracle." — Pitchfork';
    const fetchFn = vi.fn().mockResolvedValue(
      geminiResponse({
        ...adjudication,
        description: `${opening} ${quoted} ${'B'.repeat(400)}`,
      })
    );

    await resolveDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn } })
    );

    expect(logEvent).toHaveBeenCalledWith(
      'warn',
      'description_truncated',
      expect.objectContaining({ kept: 601 })
    );
  });

  it('logs nothing when the description already fits the cap', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(geminiResponse({ ...adjudication, description: `${'A'.repeat(899)}.` }));

    await resolveDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn } })
    );

    expect(logEvent).not.toHaveBeenCalledWith('warn', 'description_truncated', expect.anything());
  });

  it('labels a truncated rationale with the description adjudication', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(geminiResponse({ ...adjudication, rationale: 'r'.repeat(400) }));

    await resolveDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn } })
    );

    expect(logEvent).toHaveBeenCalledWith(
      'warn',
      'adjudication_rationale_truncated',
      expect.objectContaining({ adjudication: 'description', length: 400, cap: 300 })
    );
  });

  it('keeps the synthesis when the rationale overruns 300 chars, truncating the note', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(geminiResponse({ ...adjudication, rationale: 'r'.repeat(400) }));

    const result = await resolveDescriptionSuggestion(
      baseArgs,
      withReader({ searchWeb, fetchOptions: { fetchFn } })
    );

    expect(result?.note).toBe('r'.repeat(300));
  });
});
