/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateProse } from './gemini.js';

import type { ArtistFacts } from './types.js';

const facts: ArtistFacts = {
  displayName: 'Radiohead',
  imageTitles: ['Radiohead 2008.jpg', 'Thom Yorke.jpg'],
};

const geminiResponse = (content: unknown): Response =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(content) }] } }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

describe('generateProse', () => {
  it('returns validated prose and the image ranking', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      geminiResponse({
        shortBio: 'A short teaser.',
        longBio: '<p>A long bio.</p>',
        genres: 'alternative rock',
        primaryImageIndexes: [0],
      })
    );

    const result = await generateProse(facts, 'test-key', 'gemini-flash-latest', fetchFn);

    expect(result.shortBio).toBe('A short teaser.');
    expect(result.primaryImageIndexes).toEqual([0]);
  });

  it('sends the x-goog-api-key header and JSON responseMimeType', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'secret-key', undefined, fetchFn);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain(':generateContent');
    expect(init.headers['x-goog-api-key']).toBe('secret-key');
    expect(JSON.parse(init.body).generationConfig.responseMimeType).toBe('application/json');
  });

  it('targets the requested model in the endpoint URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', 'gemini-flash-latest', fetchFn);

    expect(fetchFn.mock.calls[0][0]).toContain('/models/gemini-flash-latest:generateContent');
  });

  it('defaults to a valid GA model id (bare gemini-3-flash 404s)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    // No model arg → uses DEFAULT_GEMINI_MODEL; must be a real, current id.
    await generateProse(facts, 'k', undefined, fetchFn);

    expect(fetchFn.mock.calls[0][0]).toContain('/models/gemini-flash-latest:generateContent');
  });

  it('embeds the source material and reference URLs in the user prompt', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));
    const grounded: ArtistFacts = {
      ...facts,
      sourceText: 'Radiohead formed in Abingdon in 1985.',
      sourceUrls: ['https://en.wikipedia.org/wiki/Radiohead'],
    };

    await generateProse(grounded, 'k', undefined, fetchFn);

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(userMessage).toContain('Radiohead formed in Abingdon in 1985.');
    expect(userMessage).toContain('https://en.wikipedia.org/wiki/Radiohead');
  });

  it('requires a 200+ word short bio with several informative inline links', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, fetchFn);

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(userMessage).toContain('AT LEAST 200 words');
    expect(userMessage).toContain('SEVERAL inline');
  });

  it('forbids listening-service links and link-list sections in the system prompt', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, fetchFn);

    const systemMessage = JSON.parse(fetchFn.mock.calls[0][1].body).systemInstruction.parts[0].text;
    expect(systemMessage).toContain('NEVER link to streaming or listening services');
    expect(systemMessage).toContain('Discovered Links');
  });

  it('instructs an extensive, sectioned article without a sources list', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, fetchFn);

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(userMessage).toContain('<h2>');
    expect(userMessage).toContain('Do NOT add a "Sources"');
  });

  it('instructs rich formatting (lists + emphasis) and inline images in the long bio', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, fetchFn);

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(userMessage).toContain('<img src="image:N"');
    expect(userMessage).toContain('<ul>/<ol> lists');
  });

  it('caps the completion length high enough for three image-rich bios', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, fetchFn);

    expect(
      JSON.parse(fetchFn.mock.calls[0][1].body).generationConfig.maxOutputTokens
    ).toBeGreaterThanOrEqual(16384);
  });

  it('targets an extended long bio of roughly 2000-3500 words', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, fetchFn);

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(userMessage).toContain('2000–3500 words');
  });

  it('instructs a punchy promotional alt bio and includes it in the JSON shape', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, fetchFn);

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(userMessage).toContain('altBio:');
    expect(userMessage).toContain('PROMOTIONAL');
    expect(userMessage).toContain('"altBio"');
  });

  it('allows an inline image in the short bio', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, fetchFn);

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    const shortBioSection = userMessage.slice(
      userMessage.indexOf('shortBio:'),
      userMessage.indexOf('longBio:')
    );
    expect(shortBioSection).toContain('<img src="image:N"');
  });

  it('validates and returns an alt bio when present', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        geminiResponse({ shortBio: 's', longBio: 'l', altBio: 'Punchy promo blurb.' })
      );

    const result = await generateProse(facts, 'k', undefined, fetchFn);

    expect(result.altBio).toBe('Punchy promo blurb.');
  });

  it('uses the research persona naming the artist in the system prompt', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(
      { ...facts, realName: 'Thomas Yorke', displayName: 'Thom Yorke' },
      'k',
      undefined,
      fetchFn
    );

    const systemMessage = JSON.parse(fetchFn.mock.calls[0][1].body).systemInstruction.parts[0].text;
    expect(systemMessage).toContain('exceptional writer');
    expect(systemMessage).toContain('Thomas Yorke (Thom Yorke)');
  });

  it('surfaces the status and response body when Gemini returns non-OK', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response('{"error":{"message":"models/x is not found for API version v1beta"}}', {
        status: 404,
      })
    );

    // The thrown error must carry Google's diagnostic body, not just the status,
    // so a 404 (wrong/unavailable model) is actionable from the logs.
    const error = await generateProse(facts, 'k', undefined, fetchFn).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Gemini request failed (404)');
    expect((error as Error).message).toContain('is not found for API version v1beta');
  });

  it('throws when the completion content is not valid JSON', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }),
          { status: 200 }
        )
      );

    await expect(generateProse(facts, 'k', undefined, fetchFn)).rejects.toThrow(
      'Gemini returned non-JSON content'
    );
  });

  it('throws when the prose fails schema validation', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: '' }));

    await expect(generateProse(facts, 'k', undefined, fetchFn)).rejects.toThrow();
  });

  it('throws when Gemini returns no candidates', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ candidates: [] }), { status: 200 }));

    await expect(generateProse(facts, 'k', undefined, fetchFn)).rejects.toThrow(
      'Gemini returned an empty completion'
    );
  });
});
