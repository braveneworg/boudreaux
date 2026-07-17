/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { resolveDescriptionSuggestion } from './video-description.js';

import type { SerperWebResult } from './serper.js';
import type { VideoDescriptionArgs } from './video-description.js';

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

describe('resolveDescriptionSuggestion', () => {
  it('synthesizes a suggestion with subset-enforced sources', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi.fn().mockResolvedValue(
      geminiResponse({
        ...adjudication,
        sourceUrls: ['https://example.com/song', 'https://fabricated.example.com/'],
      })
    );

    const result = await resolveDescriptionSuggestion(baseArgs, {
      searchWeb,
      fetchOptions: { fetchFn },
    });

    expect(result).toEqual({
      value: 'Bite Through Stone is a single by Ceschi from Broken Bone Ballads.',
      confidence: 'medium',
      sources: [{ url: 'https://example.com/song' }],
      note: 'The album page names the single.',
    });
  });

  it('runs both queries', async () => {
    const searchWeb = vi.fn().mockResolvedValue([]);

    await resolveDescriptionSuggestion(baseArgs, { searchWeb });

    expect(searchWeb).toHaveBeenCalledTimes(2);
  });

  it('returns null when Gemini returns a null description', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(geminiResponse({ ...adjudication, description: null }));

    const result = await resolveDescriptionSuggestion(baseArgs, {
      searchWeb,
      fetchOptions: { fetchFn },
    });

    expect(result).toBeNull();
  });

  it('returns null when the description is empty after trimming', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(geminiResponse({ ...adjudication, description: '   ' }));

    const result = await resolveDescriptionSuggestion(baseArgs, {
      searchWeb,
      fetchOptions: { fetchFn },
    });

    expect(result).toBeNull();
  });

  it('returns null when the web search finds no evidence', async () => {
    const searchWeb = vi.fn().mockResolvedValue([]);

    const result = await resolveDescriptionSuggestion(baseArgs, { searchWeb });

    expect(result).toBeNull();
  });

  it('returns null when every cited source was fabricated', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        geminiResponse({ ...adjudication, sourceUrls: ['https://fabricated.example.com/'] })
      );

    const result = await resolveDescriptionSuggestion(baseArgs, {
      searchWeb,
      fetchOptions: { fetchFn },
    });

    expect(result).toBeNull();
  });

  it('fixes confidence at medium (the schema carries no confidence field)', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue({ ...adjudication, confidence: 'high' });

    const result = await resolveDescriptionSuggestion(baseArgs, { searchWeb, requestJson });

    expect(result?.confidence).toBe('medium');
  });

  it('returns null instead of throwing when the adjudication call fails', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi.fn().mockRejectedValue(new Error('gemini down'));

    const result = await resolveDescriptionSuggestion(baseArgs, {
      searchWeb,
      fetchOptions: { fetchFn, retries: 0 },
    });

    expect(result).toBeNull();
  });

  it('embeds the provided facts lines in the user prompt', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    await resolveDescriptionSuggestion(baseArgs, { searchWeb, requestJson });

    const [, options] = requestJson.mock.calls[0];
    expect(options.userPrompt).toContain('- Credited artists: Ceschi.');
    expect(options.userPrompt).toContain('- MusicBrainz first-release date: 2021-04-09.');
  });

  it('sends the no-visual-claims instruction in the system prompt', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    await resolveDescriptionSuggestion(baseArgs, { searchWeb, requestJson });

    const [, options] = requestJson.mock.calls[0];
    expect(options.systemPrompt).toContain('NEVER describe visuals or events in the video itself.');
  });
});
