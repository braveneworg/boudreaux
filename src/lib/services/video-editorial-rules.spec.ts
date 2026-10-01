/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReleaseDay } from '@/lib/utils/validation/iso-date';

import {
  decideEnrichmentAutoApply,
  decidePublish,
  decideReleaseDate,
  decideSuggestionDismiss,
} from './video-editorial-rules';

const day = (value: string): ReleaseDay => value as ReleaseDay;
const TODAY = day('2026-10-01');
const PAST = day('2024-05-06');

describe('decidePublish — published ⇒ dated (ADR-0004)', () => {
  it('allows publishing a dated video', () => {
    expect(decidePublish({ releasedOn: PAST })).toEqual({ ok: true });
  });

  it('refuses to publish a dateless video', () => {
    expect(decidePublish({ releasedOn: null })).toEqual({
      ok: false,
      reason: 'RELEASE_DATE_REQUIRED',
    });
  });
});

describe('decideReleaseDate — a published video keeps its date (ADR-0004)', () => {
  it('lets a draft clear its date', () => {
    expect(decideReleaseDate({ publishedAt: null }, null)).toEqual({ ok: true });
  });

  it('refuses to clear the date of a published video', () => {
    expect(decideReleaseDate({ publishedAt: new Date('2026-01-01T00:00:00Z') }, null)).toEqual({
      ok: false,
      reason: 'PUBLISHED_KEEPS_DATE',
    });
  });

  it('lets a published video change to another date', () => {
    expect(decideReleaseDate({ publishedAt: new Date('2026-01-01T00:00:00Z') }, PAST)).toEqual({
      ok: true,
    });
  });
});

describe('decideEnrichmentAutoApply', () => {
  const blank = { releasedOn: null, description: null };

  it('fills an empty release date from the suggestion (ADR-0004: fills only an empty date)', () => {
    expect(
      decideEnrichmentAutoApply({
        state: blank,
        offered: { releasedOn: PAST, description: null },
        today: TODAY,
      })
    ).toEqual({ releasedOn: PAST, description: null });
  });

  it('never touches a release date that is already set', () => {
    expect(
      decideEnrichmentAutoApply({
        state: { releasedOn: day('2020-01-01'), description: null },
        offered: { releasedOn: PAST, description: null },
        today: TODAY,
      })
    ).toEqual({ releasedOn: null, description: null });
  });

  it("never fills today's UTC day by itself — today only appears because a human typed it", () => {
    expect(
      decideEnrichmentAutoApply({
        state: blank,
        offered: { releasedOn: TODAY, description: null },
        today: TODAY,
      })
    ).toEqual({ releasedOn: null, description: null });
  });

  it('a blank description takes the synthesized one without review (ADR-0005)', () => {
    expect(
      decideEnrichmentAutoApply({
        state: blank,
        offered: { releasedOn: null, description: 'Prose.' },
        today: TODAY,
      })
    ).toEqual({ releasedOn: null, description: 'Prose.' });
  });

  it('treats a whitespace-only stored description as blank', () => {
    expect(
      decideEnrichmentAutoApply({
        state: { releasedOn: null, description: '   ' },
        offered: { releasedOn: null, description: 'Prose.' },
        today: TODAY,
      })
    ).toEqual({ releasedOn: null, description: 'Prose.' });
  });

  it('never overwrites a non-blank description', () => {
    expect(
      decideEnrichmentAutoApply({
        state: { releasedOn: null, description: 'Kept.' },
        offered: { releasedOn: null, description: 'Prose.' },
        today: TODAY,
      })
    ).toEqual({ releasedOn: null, description: null });
  });

  it('decides the two fields independently', () => {
    expect(
      decideEnrichmentAutoApply({
        state: { releasedOn: null, description: 'Kept.' },
        offered: { releasedOn: PAST, description: 'Prose.' },
        today: TODAY,
      })
    ).toEqual({ releasedOn: PAST, description: null });
  });

  it('applies nothing when nothing was offered', () => {
    expect(decideEnrichmentAutoApply({ state: blank, offered: blank, today: TODAY })).toEqual({
      releasedOn: null,
      description: null,
    });
  });
});

describe('decideSuggestionDismiss — a description suggestion is never dismissed (ADR-0005)', () => {
  it('refuses to dismiss a video-level description suggestion', () => {
    expect(decideSuggestionDismiss({ artistId: null, field: 'description' })).toEqual({
      ok: false,
      reason: 'DESCRIPTION_NEVER_DISMISSED',
    });
  });

  it('allows dismissing a video-level release-date suggestion', () => {
    expect(decideSuggestionDismiss({ artistId: null, field: 'releasedOn' })).toEqual({ ok: true });
  });

  it('allows dismissing an artist-level suggestion whatever its field', () => {
    expect(decideSuggestionDismiss({ artistId: 'artist-1', field: 'description' })).toEqual({
      ok: true,
    });
  });
});
