/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { resolveIdentityFallback, resolveReleaseDateSuggestion } from './release-date.js';

import type { SerperWebResult } from './serper.js';

const evidence: SerperWebResult[] = [
  {
    title: 'Ceschi — Bite Through Stone premiere',
    link: 'https://example.com/premiere',
    snippet: 'The video premiered on June 1, 2020.',
    date: 'Jun 1, 2020',
  },
];

/** A Gemini generateContent response whose single part is `json`. */
const geminiResponse = (json: unknown): Response =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }] })
  );

const adjudication = {
  releaseDate: '2020-06-01',
  confidence: 'medium',
  sourceUrls: ['https://example.com/premiere'],
  rationale: 'Premiere article names the date.',
};

const baseArgs = {
  title: 'Bite Through Stone',
  artistDisplay: 'Ceschi',
  adminReleasedOn: '2021-04-09',
  serperKey: 'serper-key',
  geminiKey: 'gemini-key',
  model: 'gemini-2.5-flash',
};

describe('resolveReleaseDateSuggestion', () => {
  it('returns null when both queries yield no evidence', async () => {
    const searchWeb = vi.fn().mockResolvedValue([]);

    const result = await resolveReleaseDateSuggestion(baseArgs, { searchWeb });

    expect(result).toBeNull();
    expect(searchWeb).toHaveBeenCalledTimes(2);
  });

  it('keeps the artist in both queries when one is set', async () => {
    const searchWeb = vi.fn().mockResolvedValue([]);

    await resolveReleaseDateSuggestion(baseArgs, { searchWeb });

    expect(searchWeb).toHaveBeenNthCalledWith(
      1,
      '"Ceschi" "Bite Through Stone" video release date',
      'serper-key'
    );
    expect(searchWeb).toHaveBeenNthCalledWith(
      2,
      'Ceschi Bite Through Stone premiere',
      'serper-key'
    );
  });

  it('searches title-only queries when the artist is blank', async () => {
    const searchWeb = vi.fn().mockResolvedValue([]);

    await resolveReleaseDateSuggestion({ ...baseArgs, artistDisplay: '   ' }, { searchWeb });

    expect(searchWeb).toHaveBeenNthCalledWith(
      1,
      '"Bite Through Stone" video release date',
      'serper-key'
    );
    expect(searchWeb).toHaveBeenNthCalledWith(2, 'Bite Through Stone premiere', 'serper-key');
  });

  it('omits the artist from the adjudication prompt when blank', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    await resolveReleaseDateSuggestion(
      { ...baseArgs, artistDisplay: '' },
      { searchWeb, requestJson }
    );

    expect(requestJson).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userPrompt: expect.stringContaining('Video: "Bite Through Stone".'),
      }),
      {}
    );
    expect(requestJson).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userPrompt: expect.not.stringContaining('" by ') }),
      {}
    );
  });

  it('adjudicates a differing date into a suggestion with subset-enforced sources', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi.fn().mockResolvedValue(
      geminiResponse({
        ...adjudication,
        sourceUrls: ['https://example.com/premiere', 'https://fabricated.example.com/'],
      })
    );

    const result = await resolveReleaseDateSuggestion(baseArgs, {
      searchWeb,
      fetchOptions: { fetchFn },
    });

    expect(result).toEqual({
      value: '2020-06-01',
      confidence: 'medium',
      sources: [{ url: 'https://example.com/premiere' }],
      note: 'Premiere article names the date.',
    });
  });

  it('suppresses a date equal to the admin-entered one', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(geminiResponse({ ...adjudication, releaseDate: '2021-04-09' }));

    const result = await resolveReleaseDateSuggestion(baseArgs, {
      searchWeb,
      fetchOptions: { fetchFn },
    });

    expect(result).toBeNull();
  });

  it('returns null when every cited source was fabricated', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        geminiResponse({ ...adjudication, sourceUrls: ['https://fabricated.example.com/'] })
      );

    const result = await resolveReleaseDateSuggestion(baseArgs, {
      searchWeb,
      fetchOptions: { fetchFn },
    });

    expect(result).toBeNull();
  });

  it('downgrades a high adjudication to medium (web-only facts never rank high)', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(geminiResponse({ ...adjudication, confidence: 'high' }));

    const result = await resolveReleaseDateSuggestion(baseArgs, {
      searchWeb,
      fetchOptions: { fetchFn },
    });

    expect(result?.confidence).toBe('medium');
  });

  it('returns null instead of throwing when the adjudication call fails', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi.fn().mockRejectedValue(new Error('gemini down'));

    const result = await resolveReleaseDateSuggestion(baseArgs, {
      searchWeb,
      fetchOptions: { fetchFn, retries: 0 },
    });

    expect(result).toBeNull();
  });

  it('adjudicates via an injected requestJson with no fetch options', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const requestJson = vi.fn().mockResolvedValue(adjudication);

    const result = await resolveReleaseDateSuggestion(baseArgs, { searchWeb, requestJson });

    expect(result?.value).toBe('2020-06-01');
    expect(requestJson).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ purpose: 'adjudication' }),
      {}
    );
  });
});

describe('resolveIdentityFallback', () => {
  const fallbackArgs = {
    name: 'Ceschi',
    serperKey: 'serper-key',
    geminiKey: 'gemini-key',
    model: 'gemini-2.5-flash',
  };

  it('maps adjudicated identity facts with their sources and rationale', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi.fn().mockResolvedValue(
      geminiResponse({
        firstName: 'Francisco',
        middleName: null,
        surname: 'Ramos',
        bornOn: '1980-01-02',
        sourceUrls: ['https://example.com/premiere'],
        rationale: 'Interview states the legal name and birth date.',
      })
    );

    const result = await resolveIdentityFallback(fallbackArgs, {
      searchWeb,
      fetchOptions: { fetchFn },
    });

    expect(result).toEqual({
      firstName: 'Francisco',
      surname: 'Ramos',
      bornOn: '1980-01-02',
      sources: [{ url: 'https://example.com/premiere' }],
      note: 'Interview states the legal name and birth date.',
    });
  });

  it('returns null when the adjudication yields no facts', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi.fn().mockResolvedValue(
      geminiResponse({
        firstName: null,
        middleName: null,
        surname: null,
        bornOn: null,
        sourceUrls: ['https://example.com/premiere'],
        rationale: 'Nothing conclusive.',
      })
    );

    const result = await resolveIdentityFallback(fallbackArgs, {
      searchWeb,
      fetchOptions: { fetchFn },
    });

    expect(result).toBeNull();
  });

  it('returns null when the web search finds nothing', async () => {
    const searchWeb = vi.fn().mockResolvedValue([]);

    const result = await resolveIdentityFallback(fallbackArgs, { searchWeb });

    expect(result).toBeNull();
  });

  it('returns null instead of throwing when the adjudication call fails', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi.fn().mockRejectedValue(new Error('gemini down'));

    const result = await resolveIdentityFallback(fallbackArgs, {
      searchWeb,
      fetchOptions: { fetchFn, retries: 0 },
    });

    expect(result).toBeNull();
  });

  it('returns null when every identity source was fabricated', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi.fn().mockResolvedValue(
      geminiResponse({
        firstName: 'Francisco',
        middleName: null,
        surname: 'Ramos',
        bornOn: null,
        sourceUrls: ['https://fabricated.example.com/'],
        rationale: 'Off-evidence.',
      })
    );

    const result = await resolveIdentityFallback(fallbackArgs, {
      searchWeb,
      fetchOptions: { fetchFn },
    });

    expect(result).toBeNull();
  });

  it('carries a middle name through when the adjudication provides one', async () => {
    const searchWeb = vi.fn().mockResolvedValue(evidence);
    const fetchFn = vi.fn().mockResolvedValue(
      geminiResponse({
        firstName: 'Francisco',
        middleName: 'Javier',
        surname: 'Ramos',
        bornOn: null,
        sourceUrls: ['https://example.com/premiere'],
        rationale: 'Interview.',
      })
    );

    const result = await resolveIdentityFallback(fallbackArgs, {
      searchWeb,
      fetchOptions: { fetchFn },
    });

    expect(result?.middleName).toBe('Javier');
  });

  it('adjudicates evidence that carries no date field', async () => {
    const searchWeb = vi
      .fn()
      .mockResolvedValue([
        { title: 'Bio', link: 'https://example.com/bio', snippet: 'Real name is Francisco Ramos.' },
      ]);
    const fetchFn = vi.fn().mockResolvedValue(
      geminiResponse({
        firstName: 'Francisco',
        middleName: null,
        surname: 'Ramos',
        bornOn: null,
        sourceUrls: ['https://example.com/bio'],
        rationale: 'Bio names the artist.',
      })
    );

    const result = await resolveIdentityFallback(fallbackArgs, {
      searchWeb,
      fetchOptions: { fetchFn },
    });

    expect(result?.firstName).toBe('Francisco');
  });
});
