/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { critiqueProse, draftAndSynthesizeProse, generateProse, reviseProse, synthesizeProse } from './gemini.js';

import type { ArtistFacts, BioCritiqueViolation, BioProse } from './types.js';

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

const baseFacts = (overrides: Partial<ArtistFacts> = {}): ArtistFacts => ({
  displayName: 'Test Artist',
  imageTitles: [],
  ...overrides,
});

const fakeProse: BioProse = { shortBio: 'Short bio.', longBio: 'Long bio.' };
const sampleViolation: BioCritiqueViolation = {
  location: 'longBio',
  quote: 'some text',
  issue: 'some issue',
};

const capturePrompts = async (
  factInput: ArtistFacts
): Promise<{ systemPrompt: string; userPrompt: string }> => {
  const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));
  await generateProse(factInput, 'k', undefined, { fetchFn });
  const body = JSON.parse(fetchFn.mock.calls[0][1].body);
  return {
    systemPrompt: body.systemInstruction.parts[0].text,
    userPrompt: body.contents[0].parts[0].text,
  };
};

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

    const result = await generateProse(facts, 'test-key', 'gemini-2.5-pro', { fetchFn });

    expect(result.shortBio).toBe('A short teaser.');
    expect(result.primaryImageIndexes).toEqual([0]);
  });

  it('sends the x-goog-api-key header and JSON responseMimeType', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'secret-key', undefined, { fetchFn });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain(':generateContent');
    expect(init.headers['x-goog-api-key']).toBe('secret-key');
    expect(JSON.parse(init.body).generationConfig.responseMimeType).toBe('application/json');
  });

  it('targets the requested model in the endpoint URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', 'gemini-2.5-pro', { fetchFn });

    expect(fetchFn.mock.calls[0][0]).toContain('/models/gemini-2.5-pro:generateContent');
  });

  it('defaults to a model with free-tier quota (free tier grants zero 2.5-pro quota)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    // No model arg → uses DEFAULT_GEMINI_MODEL; must be a real, current id the
    // free tier can call — gemini-2.5-pro 429s with `limit: 0` on every metric.
    await generateProse(facts, 'k', undefined, { fetchFn });

    expect(fetchFn.mock.calls[0][0]).toContain('/models/gemini-2.5-flash:generateContent');
  });

  it('embeds the source material and reference URLs in the user prompt', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));
    const grounded: ArtistFacts = {
      ...facts,
      sourceText: 'Radiohead formed in Abingdon in 1985.',
      sourceUrls: ['https://en.wikipedia.org/wiki/Radiohead'],
    };

    await generateProse(grounded, 'k', undefined, { fetchFn });

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(userMessage).toContain('Radiohead formed in Abingdon in 1985.');
    expect(userMessage).toContain('https://en.wikipedia.org/wiki/Radiohead');
  });

  it('includes authoritative birth/formed dates and the never-before-birth rule', async () => {
    const factInput = baseFacts({ bornOn: '1982-05-01', formedOn: '2004-01-01' });
    const { systemPrompt, userPrompt } = await capturePrompts(factInput);
    expect(userPrompt).toContain('Born: 1982-05-01');
    expect(userPrompt).toContain('Formed: 2004-01-01');
    expect(systemPrompt).toContain('born 1982-05-01');
    expect(systemPrompt).toMatch(/never state or imply.*before/i);
  });

  it('requires a 200+ word short bio with several informative inline links', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(userMessage).toContain('AT LEAST 200 words');
    expect(userMessage).toContain('SEVERAL inline');
  });

  it('forbids link-list sections in the system prompt but not streaming links', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    const systemMessage = JSON.parse(fetchFn.mock.calls[0][1].body).systemInstruction.parts[0].text;
    expect(systemMessage).not.toContain('NEVER link to streaming or listening services');
    expect(systemMessage).toContain('Discovered Links');
  });

  it('instructs an extensive, sectioned article without a sources list', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(userMessage).toContain('<h2>');
    expect(userMessage).toContain('Do NOT add a "Sources"');
  });

  it('instructs rich formatting (lists + emphasis) and inline images in the long bio', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(userMessage).toContain('<img src="image:N"');
    expect(userMessage).toContain('<ul>/<ol> lists');
  });

  it('prefers links over bold in the long bio', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    const longBioSection = userMessage.slice(
      userMessage.indexOf('longBio:'),
      userMessage.indexOf('altBio:')
    );
    expect(longBioSection).toContain('Prefer links over bold');
  });

  it('bolds pivotal unlinkable facts in the long bio', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    const longBioSection = userMessage.slice(
      userMessage.indexOf('longBio:'),
      userMessage.indexOf('altBio:')
    );
    expect(longBioSection).toContain('ADDITIONALLY bold');
  });

  it('instructs italicizing work titles with <em> in the long bio', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    const longBioSection = userMessage.slice(
      userMessage.indexOf('longBio:'),
      userMessage.indexOf('altBio:')
    );
    expect(longBioSection).toContain('italicize');
    expect(longBioSection).toContain('work titles');
  });

  it('requires at least one list in the long bio when the material supports it', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    const longBioSection = userMessage.slice(
      userMessage.indexOf('longBio:'),
      userMessage.indexOf('altBio:')
    );
    expect(longBioSection).toContain('least one list in the long bio');
  });

  it('has no streaming/listening service ban in the short bio user-prompt section', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    const shortBioSection = userMessage.slice(
      userMessage.indexOf('shortBio:'),
      userMessage.indexOf('longBio:')
    );
    expect(shortBioSection).not.toContain('streaming');
  });

  it('has no streaming/listening service ban in the long bio user-prompt section', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    const longBioSection = userMessage.slice(
      userMessage.indexOf('longBio:'),
      userMessage.indexOf('altBio:')
    );
    expect(longBioSection).not.toContain('streaming');
  });

  it('has no streaming/listening service ban in the alt bio user-prompt section', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    const altBioSection = userMessage.slice(userMessage.indexOf('altBio:'));
    expect(altBioSection).not.toContain('streaming');
  });

  it('forbids <img> tags when no images are available, in every call', async () => {
    const fetchFn = vi
      .fn()
      .mockImplementation(async () => geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });
    await synthesizeProse(
      { facts, drafts: [{ shortBio: 's', longBio: 'l' }], apiKey: 'k' },
      { fetchFn }
    );

    for (const call of fetchFn.mock.calls) {
      const systemMessage = JSON.parse(call[1].body).systemInstruction.parts[0].text;
      expect(systemMessage).toContain('NEVER emit an <img> tag unless an Available images list');
    }
  });

  it('requires an inline link in every long-bio section', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    const longBioSection = userMessage.slice(
      userMessage.indexOf('longBio:'),
      userMessage.indexOf('altBio:')
    );
    expect(longBioSection).toContain('EVERY <h2> section');
  });

  it('limits the long bio to a few tasteful inline images', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    const longBioSection = userMessage.slice(
      userMessage.indexOf('longBio:'),
      userMessage.indexOf('altBio:')
    );
    expect(longBioSection).toContain('2–3 inline images');
    expect(longBioSection).toContain('never place two images');
  });

  it('caps the completion length high enough for three image-rich bios', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    expect(
      JSON.parse(fetchFn.mock.calls[0][1].body).generationConfig.maxOutputTokens
    ).toBeGreaterThanOrEqual(16384);
  });

  it('targets an extended long bio of roughly 2000-3500 words', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(userMessage).toContain('2000–3500 words');
  });

  it('instructs a punchy promotional alt bio and includes it in the JSON shape', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(userMessage).toContain('altBio:');
    expect(userMessage).toContain('PROMOTIONAL');
    expect(userMessage).toContain('"altBio"');
  });

  it('allows an inline image in the short bio', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

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

    const result = await generateProse(facts, 'k', undefined, { fetchFn });

    expect(result.altBio).toBe('Punchy promo blurb.');
  });

  it('uses the research persona naming the artist in the system prompt', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(
      { ...facts, realName: 'Thomas Yorke', displayName: 'Thom Yorke' },
      'k',
      undefined,
      { fetchFn }
    );

    const systemMessage = JSON.parse(fetchFn.mock.calls[0][1].body).systemInstruction.parts[0].text;
    expect(systemMessage).toContain('exceptional writer');
    expect(systemMessage).toContain('Thomas Yorke (Thom Yorke)');
  });

  it('applies an explicit draft temperature to the generation config', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn, temperature: 0.95 });

    expect(JSON.parse(fetchFn.mock.calls[0][1].body).generationConfig.temperature).toBe(0.95);
  });

  it('keeps the default temperature when none is given', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, { fetchFn });

    expect(JSON.parse(fetchFn.mock.calls[0][1].body).generationConfig.temperature).toBe(0.6);
  });

  it('appends a style directive to the system prompt when given', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'k', undefined, {
      fetchFn,
      styleDirective: 'Prioritize narrative voice.',
    });

    const systemMessage = JSON.parse(fetchFn.mock.calls[0][1].body).systemInstruction.parts[0].text;
    expect(systemMessage).toContain('Prioritize narrative voice.');
  });

  it('throws when Gemini returns a non-OK status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('nope', { status: 400 }));

    await expect(generateProse(facts, 'k', undefined, { fetchFn })).rejects.toThrow(
      'Gemini request failed'
    );
  });

  it('includes a response-body snippet in the failure message', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response('{"error":{"message":"key expired"}}', { status: 400 }));

    await expect(generateProse(facts, 'k', undefined, { fetchFn })).rejects.toThrow(
      'Gemini request failed (400): {"error":{"message":"key expired"}}'
    );
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

    await expect(generateProse(facts, 'k', undefined, { fetchFn })).rejects.toThrow(
      'Gemini returned non-JSON content'
    );
  });

  it('throws when the prose fails schema validation', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: '' }));

    await expect(generateProse(facts, 'k', undefined, { fetchFn })).rejects.toThrow();
  });

  describe('429 retry pacing', () => {
    // Factory, not a shared instance — a Response body is single-read.
    const prose = (): Response => geminiResponse({ shortBio: 's', longBio: 'l' });
    const rateLimited = (headers?: HeadersInit): Response =>
      new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 429, headers });

    it('pauses 30s then retries a rate-limited request', async () => {
      const fetchFn = vi.fn().mockResolvedValueOnce(rateLimited()).mockResolvedValue(prose());
      const sleep = vi.fn().mockResolvedValue(undefined);

      const result = await generateProse(facts, 'k', undefined, { fetchFn, sleep });

      expect(result.shortBio).toBe('s');
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledWith(30000);
    });

    it('backs off 30s then 60s across consecutive 429s', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(rateLimited())
        .mockResolvedValueOnce(rateLimited())
        .mockResolvedValue(prose());
      const sleep = vi.fn().mockResolvedValue(undefined);

      await generateProse(facts, 'k', undefined, { fetchFn, sleep });

      expect(sleep).toHaveBeenNthCalledWith(1, 30000);
      expect(sleep).toHaveBeenNthCalledWith(2, 60000);
    });

    it('prefers a server-provided Retry-After over the 30s default', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(rateLimited({ 'retry-after': '45' }))
        .mockResolvedValue(prose());
      const sleep = vi.fn().mockResolvedValue(undefined);

      await generateProse(facts, 'k', undefined, { fetchFn, sleep });

      expect(sleep).toHaveBeenCalledWith(45000);
    });

    it('throws the quota detail once retries are exhausted', async () => {
      const fetchFn = vi.fn().mockResolvedValue(rateLimited());
      const sleep = vi.fn().mockResolvedValue(undefined);

      await expect(generateProse(facts, 'k', undefined, { fetchFn, sleep })).rejects.toThrow(
        'Gemini request failed (429): {"error":{"status":"RESOURCE_EXHAUSTED"}}'
      );
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('synthesizeProse', () => {
    const drafts: BioProse[] = [
      { shortBio: 'Draft one short.', longBio: '<p>Draft one long.</p>', altBio: 'Promo one.' },
      { shortBio: 'Draft two short.', longBio: '<p>Draft two long.</p>', altBio: 'Promo two.' },
    ];
    const groundedFacts: ArtistFacts = {
      ...facts,
      sourceText: 'Radiohead formed in Abingdon in 1985.',
      sourceUrls: ['https://en.wikipedia.org/wiki/Radiohead'],
    };

    it('uses an editor persona naming the artist in the system prompt', async () => {
      const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

      await synthesizeProse({ facts: groundedFacts, drafts, apiKey: 'k' }, { fetchFn });

      const systemMessage = JSON.parse(fetchFn.mock.calls[0][1].body).systemInstruction.parts[0]
        .text;
      expect(systemMessage).toContain('editor');
      expect(systemMessage).toContain('Radiohead');
      expect(systemMessage).not.toContain('NEVER link to streaming or listening services');
      expect(systemMessage).toContain('Discovered Links');
    });

    it('embeds every draft plus the images and reference URLs in the user prompt', async () => {
      const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

      await synthesizeProse({ facts: groundedFacts, drafts, apiKey: 'k' }, { fetchFn });

      const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
      expect(userMessage).toContain('Draft one long.');
      expect(userMessage).toContain('Draft two long.');
      expect(userMessage).toContain('Available images (0-indexed)');
      expect(userMessage).toContain('https://en.wikipedia.org/wiki/Radiohead');
      expect(userMessage).toContain('"shortBio"');
    });

    it("instructs the synthesis to preserve the drafts' inline links and images", async () => {
      const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

      await synthesizeProse({ facts: groundedFacts, drafts, apiKey: 'k' }, { fetchFn });

      const userMessage = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
      expect(userMessage).toContain('Preserve the inline <a> links and <img> images');
    });

    it('never forwards the raw source material to the synthesis call', async () => {
      const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

      await synthesizeProse({ facts: groundedFacts, drafts, apiKey: 'k' }, { fetchFn });

      const body = fetchFn.mock.calls[0][1].body as string;
      expect(body).not.toContain('Radiohead formed in Abingdon in 1985.');
    });

    it('returns the validated synthesized prose', async () => {
      const fetchFn = vi.fn().mockResolvedValue(
        geminiResponse({
          shortBio: 'Definitive short.',
          longBio: '<p>Definitive long.</p>',
          altBio: 'Definitive promo.',
          primaryImageIndexes: [1],
        })
      );

      const result = await synthesizeProse(
        { facts: groundedFacts, drafts, apiKey: 'k' },
        { fetchFn }
      );

      expect(result.shortBio).toBe('Definitive short.');
      expect(result.primaryImageIndexes).toEqual([1]);
    });

    it('targets the same generateContent endpoint for the given model', async () => {
      const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

      await synthesizeProse(
        { facts: groundedFacts, drafts, apiKey: 'k', model: 'gemini-2.5-flash' },
        { fetchFn }
      );

      expect(fetchFn.mock.calls[0][0]).toContain('/models/gemini-2.5-flash:generateContent');
    });

    it('carries the authoritative birth-date constraint into the synthesis system prompt', async () => {
      const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ shortBio: 's', longBio: 'l' }));

      await synthesizeProse(
        { facts: baseFacts({ bornOn: '1982-05-01' }), drafts, apiKey: 'k' },
        { fetchFn }
      );

      const systemMessage = JSON.parse(fetchFn.mock.calls[0][1].body).systemInstruction.parts[0]
        .text;
      expect(systemMessage).toContain('born 1982-05-01');
      expect(systemMessage).toMatch(/never state or imply.*before/i);
    });
  });

  describe('draftAndSynthesizeProse', () => {
    const grounded: ArtistFacts = {
      ...facts,
      sourceText: 'Radiohead formed in Abingdon in 1985.',
      sourceUrls: ['https://en.wikipedia.org/wiki/Radiohead'],
    };
    // Factories, not shared instances — a Response body is single-read.
    const draftA = (): Response =>
      geminiResponse({ shortBio: 'Draft A short.', longBio: '<p>Draft A long.</p>' });
    const draftB = (): Response =>
      geminiResponse({ shortBio: 'Draft B short.', longBio: '<p>Draft B long.</p>' });
    const definitive = (): Response =>
      geminiResponse({ shortBio: 'Definitive short.', longBio: '<p>Definitive long.</p>' });

    it('makes two draft calls and one synthesis call, returning the synthesis', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(draftA())
        .mockResolvedValueOnce(draftB())
        .mockResolvedValueOnce(definitive());

      const result = await draftAndSynthesizeProse(grounded, 'k', undefined, { fetchFn });

      expect(fetchFn).toHaveBeenCalledTimes(3);
      expect(result.shortBio).toBe('Definitive short.');
    });

    it('varies temperature and style directive across the drafts', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(draftA())
        .mockResolvedValueOnce(draftB())
        .mockResolvedValueOnce(definitive());

      await draftAndSynthesizeProse(grounded, 'k', undefined, { fetchFn });

      const bodies = fetchFn.mock.calls.slice(0, 2).map(([, init]) => JSON.parse(init.body));
      const temperatures = bodies.map((body) => body.generationConfig.temperature);
      const systems = bodies.map((body) => body.systemInstruction.parts[0].text);
      expect(new Set(temperatures).size).toBe(2);
      expect(systems[0]).not.toBe(systems[1]);
    });

    it('feeds both drafts, but not the raw source text, to the synthesis call', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(draftA())
        .mockResolvedValueOnce(draftB())
        .mockResolvedValueOnce(definitive());

      await draftAndSynthesizeProse(grounded, 'k', undefined, { fetchFn });

      const synthesisBody = fetchFn.mock.calls[2][1].body as string;
      expect(synthesisBody).toContain('Draft A long.');
      expect(synthesisBody).toContain('Draft B long.');
      expect(synthesisBody).not.toContain('Radiohead formed in Abingdon in 1985.');
    });

    it('synthesizes from the surviving draft when the other draft fails', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(new Response('boom', { status: 400 }))
        .mockResolvedValueOnce(draftB())
        .mockResolvedValueOnce(definitive());

      const result = await draftAndSynthesizeProse(grounded, 'k', undefined, { fetchFn });

      expect(result.shortBio).toBe('Definitive short.');
      const synthesisBody = fetchFn.mock.calls[2][1].body as string;
      expect(synthesisBody).toContain('Draft B long.');
      expect(synthesisBody).not.toContain('Draft A long.');
    });

    it('falls back to the first draft when the synthesis call fails', async () => {
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(draftA())
        .mockResolvedValueOnce(draftB())
        .mockResolvedValueOnce(new Response('boom', { status: 400 }));

      const result = await draftAndSynthesizeProse(grounded, 'k', undefined, { fetchFn });

      expect(result.shortBio).toBe('Draft A short.');
    });

    it('throws the first draft failure when every draft fails', async () => {
      const fetchFn = vi.fn().mockResolvedValue(new Response('boom', { status: 400 }));

      await expect(draftAndSynthesizeProse(grounded, 'k', undefined, { fetchFn })).rejects.toThrow(
        'Gemini request failed (400)'
      );
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  it('throws when Gemini returns no candidates', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ candidates: [] }), { status: 200 }));

    await expect(generateProse(facts, 'k', undefined, { fetchFn })).rejects.toThrow(
      'Gemini returned an empty completion'
    );
  });
});

describe('critiqueProse', () => {
  it('posts bios + suspect years and validates the violations JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      geminiResponse({
        violations: [
          { location: 'longBio', quote: 'began in 1949', issue: 'precedes birth (1982)' },
        ],
      })
    );
    const result = await critiqueProse(
      {
        facts: baseFacts({ bornOn: '1982-05-01' }),
        prose: fakeProse,
        suspectYears: [1949],
        apiKey: 'k',
        model: 'm',
      },
      { fetchFn }
    );
    expect(result.violations).toHaveLength(1);
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toContain('1949');
    expect(body.generationConfig.temperature).toBe(0.2);
  });

  it('returns an empty violations array for clean bios', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse({ violations: [] }));
    const result = await critiqueProse(
      {
        facts: baseFacts({}),
        prose: fakeProse,
        suspectYears: [],
        apiKey: 'k',
        model: 'm',
      },
      { fetchFn }
    );
    expect(result.violations).toHaveLength(0);
    const text = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(text).not.toContain('SUSPECT YEARS');
  });
});

describe('reviseProse', () => {
  it('posts violations + plagiarized segments and returns full prose', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse(fakeProse));
    const revised = await reviseProse(
      {
        facts: baseFacts({}),
        prose: fakeProse,
        violations: [sampleViolation],
        plagiarizedSegments: [{ text: 'copied run here' }],
        apiKey: 'k',
        model: 'm',
      },
      { fetchFn }
    );
    expect(revised.longBio).toBe(fakeProse.longBio);
    const text = JSON.parse(fetchFn.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(text).toContain('copied run here');
    expect(text).toMatch(/rewrite only/i);
  });

  it('uses temperature 0.4 for the revise call', async () => {
    const fetchFn = vi.fn().mockResolvedValue(geminiResponse(fakeProse));
    await reviseProse(
      {
        facts: baseFacts({}),
        prose: fakeProse,
        violations: [],
        plagiarizedSegments: [],
        apiKey: 'k',
        model: 'm',
      },
      { fetchFn }
    );
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.generationConfig.temperature).toBe(0.4);
    const text = body.contents[0].parts[0].text;
    expect(text).not.toContain('FACT VIOLATIONS');
    expect(text).not.toContain('PLAGIARIZED PHRASING');
  });
});
