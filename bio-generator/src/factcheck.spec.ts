/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { findYearsBeforeBirth, runQualityPasses } from './factcheck.js';

import type { ArtistFacts, BioProse } from './types.js';

const prose: BioProse = {
  shortBio: 'Artist born in 1990 released debut in 2010.',
  longBio: '<p>A long biography of the artist who was active from 2010.</p>',
  altBio: 'Punchy promo blurb about the artist.',
};

const factsBase: ArtistFacts = {
  displayName: 'Test Artist',
  imageTitles: [],
};

/** sourceText that shares no 8-word run with `prose` — plagiarism gate stays closed. */
const factsWithSource: ArtistFacts = {
  ...factsBase,
  sourceText: 'Some source material that does not overlap with the prose at all.',
};

describe('findYearsBeforeBirth', () => {
  it('flags years earlier than the birth year, deduped and sorted', () => {
    expect(
      findYearsBeforeBirth('<p>Began in 1949, again 1949, then 1990 and 2004.</p>', 1982)
    ).toEqual([1949]);
  });

  it('returns empty when all years are on/after birth', () => {
    expect(findYearsBeforeBirth('<p>Born 1982, debut 2004.</p>', 1982)).toEqual([]);
  });
});

describe('runQualityPasses', () => {
  it('returns prose untouched when critic finds nothing and no plagiarism', async () => {
    const deps = {
      critiqueProse: vi.fn().mockResolvedValue({ violations: [] }),
      reviseProse: vi.fn(),
    };

    const result = await runQualityPasses(
      { prose, facts: factsWithSource, apiKey: 'k', model: 'm' },
      deps
    );

    expect(result).toBe(prose);
    expect(deps.reviseProse).not.toHaveBeenCalled();
  });

  it('revises when the critic reports violations', async () => {
    const violations = [
      { location: 'shortBio' as const, quote: 'born in 1990', issue: 'Year precedes birth date' },
    ];
    const revised: BioProse = { shortBio: 'Revised short.', longBio: '<p>Revised long.</p>' };
    const deps = {
      critiqueProse: vi.fn().mockResolvedValue({ violations }),
      reviseProse: vi.fn().mockResolvedValue(revised),
    };

    const result = await runQualityPasses(
      { prose, facts: factsWithSource, apiKey: 'k', model: 'm' },
      deps
    );

    expect(deps.reviseProse).toHaveBeenCalledWith(expect.objectContaining({ violations, prose }));
    expect(result).toBe(revised);
  });

  it('revises on plagiarized segments even when critic passes', async () => {
    // sourceText shares the exact 8-word shingle
    // 'artist born in 1990 released debut in 2010' with prose.shortBio
    const sourceText = 'Artist born in 1990 released debut in 2010 and continued from there.';
    const facts: ArtistFacts = { ...factsBase, sourceText };
    const revised: BioProse = { shortBio: 'Fresh take.', longBio: '<p>Fresh long.</p>' };
    const deps = {
      critiqueProse: vi.fn().mockResolvedValue({ violations: [] }),
      reviseProse: vi.fn().mockResolvedValue(revised),
    };

    const result = await runQualityPasses({ prose, facts, apiKey: 'k', model: 'm' }, deps);

    expect(deps.reviseProse).toHaveBeenCalled();
    expect(result).toBe(revised);
  });

  it('still revises when critic throws but plagiarism is detected', async () => {
    // sourceText shares the 8-word shingle 'artist born in 1990 released debut in 2010'
    // with prose.shortBio — the plagiarism gate fires even though the critic threw.
    const sourceText = 'Artist born in 1990 released debut in 2010 and continued from there.';
    const facts: ArtistFacts = { ...factsBase, sourceText };
    const revised: BioProse = {
      shortBio: 'Distinct revised short.',
      longBio: '<p>Distinct revised long.</p>',
    };
    const deps = {
      critiqueProse: vi.fn().mockRejectedValue(new Error('Gemini down')),
      reviseProse: vi.fn().mockResolvedValue(revised),
    };

    const result = await runQualityPasses({ prose, facts, apiKey: 'k', model: 'm' }, deps);

    expect(deps.reviseProse).toHaveBeenCalled();
    expect(result).toBe(revised);
  });

  it('returns original prose when critic throws and no plagiarism is detected', async () => {
    const deps = {
      critiqueProse: vi.fn().mockRejectedValue(new Error('Gemini down')),
      reviseProse: vi.fn(),
    };

    const result = await runQualityPasses(
      { prose, facts: factsWithSource, apiKey: 'k', model: 'm' },
      deps
    );

    expect(result).toBe(prose);
    expect(deps.reviseProse).not.toHaveBeenCalled();
  });

  it('returns original prose when revise throws', async () => {
    const violations = [
      { location: 'shortBio' as const, quote: 'born in 1990', issue: 'Year issue' },
    ];
    const deps = {
      critiqueProse: vi.fn().mockResolvedValue({ violations }),
      reviseProse: vi.fn().mockRejectedValue(new Error('Revise failed')),
    };

    const result = await runQualityPasses(
      { prose, facts: factsWithSource, apiKey: 'k', model: 'm' },
      deps
    );

    expect(result).toBe(prose);
  });
});
