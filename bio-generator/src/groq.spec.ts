/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at './groq.js' */

import { generateProse } from './groq.js';

import type { ArtistFacts } from './types.js';

const facts: ArtistFacts = {
  displayName: 'Radiohead',
  imageTitles: ['Radiohead 2008.jpg', 'Thom Yorke.jpg'],
};

const groqResponse = (content: unknown): Response =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('generateProse', () => {
  it('returns validated prose and the image ranking', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      groqResponse({
        shortBio: 'A short teaser.',
        longBio: '<p>A long bio.</p>',
        genres: 'alternative rock',
        primaryImageIndexes: [0],
      })
    );

    const result = await generateProse(facts, 'test-key', 'llama-3.3-70b-versatile', fetchFn);

    expect(result.shortBio).toBe('A short teaser.');
    expect(result.primaryImageIndexes).toEqual([0]);
  });

  it('sends the Authorization bearer token and JSON response_format', async () => {
    const fetchFn = vi.fn().mockResolvedValue(groqResponse({ shortBio: 's', longBio: 'l' }));

    await generateProse(facts, 'secret-key', undefined, fetchFn);

    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer secret-key');
    expect(JSON.parse(init.body).response_format).toEqual({ type: 'json_object' });
  });

  it('throws when Groq returns a non-OK status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('quota', { status: 429 }));

    await expect(generateProse(facts, 'k', undefined, fetchFn)).rejects.toThrow(
      'Groq request failed'
    );
  });

  it('throws when the completion content is not valid JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'not json' } }] }), {
        status: 200,
      })
    );

    await expect(generateProse(facts, 'k', undefined, fetchFn)).rejects.toThrow(
      'Groq returned non-JSON content'
    );
  });

  it('throws when the prose fails schema validation', async () => {
    const fetchFn = vi.fn().mockResolvedValue(groqResponse({ shortBio: '' }));

    await expect(generateProse(facts, 'k', undefined, fetchFn)).rejects.toThrow();
  });
});
