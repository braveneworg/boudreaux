/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  applyVideoSuggestionInputSchema,
  ENRICHMENT_STATUSES,
  enrichmentIneligibilityReason,
  hasEnrichableArtist,
  isEnrichableCategory,
  isEnrichmentEligible,
  isInFlightEnrichmentStatus,
  STALE_JOB_MS,
  VIDEO_LEVEL_SUGGESTION_FIELDS,
  VIDEO_PROGRESS_STAGES,
  VIDEO_SUGGESTION_FIELDS,
  videoEnrichmentCallbackSchema,
  videoEnrichmentDataSchema,
  videoEnrichmentProgressPostSchema,
  videoEnrichmentStatusResponseSchema,
  videoSuggestionSchema,
} from './video-enrichment-schema';

const OBJECT_ID = 'a'.repeat(24);

const validSuggestion = {
  field: 'bornOn',
  value: '1985-03-15',
  confidence: 'high',
  sources: [{ url: 'https://musicbrainz.org/artist/x', label: 'MusicBrainz' }],
  note: 'From MusicBrainz life-span.',
};

const validData = {
  artists: [{ artistId: OBJECT_ID, suggestions: [validSuggestion] }],
  video: {
    releasedOn: {
      value: '2020-06-01',
      confidence: 'medium',
      sources: [{ url: 'https://example.com/premiere' }],
    },
  },
  model: 'gemini-2.5-flash',
};

describe('video-enrichment-schema', () => {
  it('pins the suggestion field whitelist', () => {
    expect(VIDEO_SUGGESTION_FIELDS).toEqual([
      'firstName',
      'middleName',
      'surname',
      'akaNames',
      'bornOn',
      'displayName',
      'releasedOn',
      'description',
      'featuredArtist',
    ]);
  });

  it('pins the video-level (client-applied) field whitelist', () => {
    expect(VIDEO_LEVEL_SUGGESTION_FIELDS).toEqual(['releasedOn', 'description', 'featuredArtist']);
  });

  it('pins the enrichment lifecycle statuses', () => {
    expect(ENRICHMENT_STATUSES).toEqual(['pending', 'processing', 'succeeded', 'failed']);
  });

  it('pins the progress stages in timeline order', () => {
    expect(VIDEO_PROGRESS_STAGES).toEqual([
      'musicbrainz',
      'wikidata',
      'web-search',
      'adjudicating',
      'finalizing',
    ]);
  });

  it('re-exports the 17-minute stale-job window', () => {
    expect(STALE_JOB_MS).toBe(17 * 60 * 1000);
  });

  describe('isInFlightEnrichmentStatus', () => {
    it('treats pending as in flight', () => {
      expect(isInFlightEnrichmentStatus('pending')).toBe(true);
    });

    it('treats processing as in flight', () => {
      expect(isInFlightEnrichmentStatus('processing')).toBe(true);
    });

    it('treats succeeded as terminal', () => {
      expect(isInFlightEnrichmentStatus('succeeded')).toBe(false);
    });

    it('treats null as not in flight', () => {
      expect(isInFlightEnrichmentStatus(null)).toBe(false);
    });
  });

  describe('enrichment eligibility', () => {
    it('a MUSIC video with an artist is eligible', () => {
      expect(isEnrichmentEligible({ category: 'MUSIC', artist: 'Ceschi' })).toBe(true);
    });

    it('a non-MUSIC video with an artist is not eligible', () => {
      expect(isEnrichmentEligible({ category: 'INFORMATIONAL', artist: 'Ceschi' })).toBe(false);
    });

    it('a MUSIC video with a blank artist is not eligible', () => {
      expect(isEnrichmentEligible({ category: 'MUSIC', artist: '   ' })).toBe(false);
    });

    it('a missing category is not eligible', () => {
      expect(isEnrichmentEligible({ category: null, artist: 'Ceschi' })).toBe(false);
    });

    it('isEnrichableCategory accepts only MUSIC', () => {
      expect(isEnrichableCategory('MUSIC')).toBe(true);
    });

    it('isEnrichableCategory rejects other categories', () => {
      expect(isEnrichableCategory('INFORMATIONAL')).toBe(false);
    });

    it('reports a category reason for a non-MUSIC video', () => {
      expect(enrichmentIneligibilityReason({ category: 'INFORMATIONAL', artist: 'Ceschi' })).toBe(
        'category'
      );
    });

    it('reports an artist reason for a MUSIC video with a blank artist', () => {
      expect(enrichmentIneligibilityReason({ category: 'MUSIC', artist: ' ' })).toBe('artist');
    });

    it('reports no reason for an eligible video', () => {
      expect(enrichmentIneligibilityReason({ category: 'MUSIC', artist: 'Ceschi' })).toBeNull();
    });

    it('hasEnrichableArtist rejects undefined', () => {
      expect(hasEnrichableArtist(undefined)).toBe(false);
    });

    it('hasEnrichableArtist accepts a padded name', () => {
      expect(hasEnrichableArtist('  Ceschi  ')).toBe(true);
    });
  });

  describe('videoSuggestionSchema', () => {
    it('accepts a fully-populated suggestion', () => {
      expect(videoSuggestionSchema.safeParse(validSuggestion).success).toBe(true);
    });

    it('rejects a value longer than 500 characters', () => {
      const parsed = videoSuggestionSchema.safeParse({
        ...validSuggestion,
        value: 'x'.repeat(501),
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects a non-http(s) source URL', () => {
      const parsed = videoSuggestionSchema.safeParse({
        ...validSuggestion,
        sources: [{ url: 'javascript:alert(1)' }],
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects more than 10 sources', () => {
      const sources = Array.from({ length: 11 }, (_, i) => ({ url: `https://e.com/${i}` }));
      expect(videoSuggestionSchema.safeParse({ ...validSuggestion, sources }).success).toBe(false);
    });

    it('rejects a source URL longer than 2048 characters', () => {
      const url = `https://e.com/${'x'.repeat(2048)}`;
      const parsed = videoSuggestionSchema.safeParse({
        ...validSuggestion,
        sources: [{ url }],
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('videoEnrichmentDataSchema', () => {
    it('accepts the full payload with a video-level release date', () => {
      expect(videoEnrichmentDataSchema.safeParse(validData).success).toBe(true);
    });

    it('rejects a malformed artistId', () => {
      const parsed = videoEnrichmentDataSchema.safeParse({
        ...validData,
        artists: [{ artistId: 'nope', suggestions: [] }],
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects more than 12 suggestions per artist', () => {
      const suggestions = Array.from({ length: 13 }, () => validSuggestion);
      const parsed = videoEnrichmentDataSchema.safeParse({
        ...validData,
        artists: [{ artistId: OBJECT_ID, suggestions }],
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects more than 10 artists', () => {
      const artists = Array.from({ length: 11 }, () => ({
        artistId: OBJECT_ID,
        suggestions: [validSuggestion],
      }));
      expect(videoEnrichmentDataSchema.safeParse({ ...validData, artists }).success).toBe(false);
    });

    it('accepts a video-level description and two featured artists', () => {
      const parsed = videoEnrichmentDataSchema.safeParse({
        ...validData,
        video: {
          ...validData.video,
          description: {
            value: 'x'.repeat(600),
            confidence: 'medium',
            sources: [{ url: 'https://example.com/premiere' }],
          },
          featuredArtists: [
            {
              value: 'Sole',
              confidence: 'medium',
              sources: [{ url: 'https://musicbrainz.org/artist/y' }],
            },
            {
              value: 'Buck 65',
              confidence: 'low',
              sources: [{ url: 'https://musicbrainz.org/artist/z' }],
            },
          ],
        },
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects a 2001-character video description', () => {
      const parsed = videoEnrichmentDataSchema.safeParse({
        ...validData,
        video: {
          description: {
            value: 'x'.repeat(2001),
            confidence: 'medium',
            sources: [{ url: 'https://example.com/premiere' }],
          },
        },
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects a sixth featured artist', () => {
      const featuredArtists = Array.from({ length: 6 }, (_, i) => ({
        value: `Feature ${i}`,
        confidence: 'medium' as const,
        sources: [{ url: `https://musicbrainz.org/artist/${i}` }],
      }));
      const parsed = videoEnrichmentDataSchema.safeParse({
        ...validData,
        video: { featuredArtists },
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('videoEnrichmentCallbackSchema', () => {
    it('accepts an ok result envelope', () => {
      const parsed = videoEnrichmentCallbackSchema.safeParse({
        jobToken: 't',
        result: { ok: true, data: validData },
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts a failure envelope', () => {
      const parsed = videoEnrichmentCallbackSchema.safeParse({
        jobToken: 't',
        result: { ok: false, error: 'boom' },
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects an empty jobToken', () => {
      const parsed = videoEnrichmentCallbackSchema.safeParse({
        jobToken: '',
        result: { ok: false, error: 'boom' },
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects a jobToken longer than 200 characters', () => {
      const parsed = videoEnrichmentCallbackSchema.safeParse({
        jobToken: 't'.repeat(201),
        result: { ok: false, error: 'boom' },
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('videoEnrichmentProgressPostSchema', () => {
    it('accepts a checkpoint without at (server stamps it)', () => {
      const parsed = videoEnrichmentProgressPostSchema.safeParse({
        jobToken: 't',
        stage: 'wikidata',
        counts: { artists: 2 },
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects an unknown stage', () => {
      const parsed = videoEnrichmentProgressPostSchema.safeParse({
        jobToken: 't',
        stage: 'drafting',
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects a jobToken longer than 200 characters', () => {
      const parsed = videoEnrichmentProgressPostSchema.safeParse({
        jobToken: 't'.repeat(201),
        stage: 'wikidata',
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('videoEnrichmentStatusResponseSchema', () => {
    it('accepts the assembled wire shape', () => {
      const parsed = videoEnrichmentStatusResponseSchema.safeParse({
        status: 'succeeded',
        error: null,
        progress: null,
        enrichedAt: '2026-07-12T00:00:00.000Z',
        currentReleasedOn: '2021-04-09',
        artists: [
          {
            artistId: OBJECT_ID,
            displayName: 'Ceschi',
            role: 'PRIMARY',
            current: {
              firstName: 'Francisco',
              middleName: null,
              surname: 'Ramos',
              akaNames: null,
              displayName: 'Ceschi',
              bornOn: null,
            },
          },
        ],
        suggestions: [
          {
            id: OBJECT_ID,
            artistId: OBJECT_ID,
            field: 'bornOn',
            value: '1985-03-15',
            confidence: 'high',
            sources: [{ url: 'https://musicbrainz.org/artist/x' }],
            note: null,
            status: 'pending',
          },
        ],
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe('applyVideoSuggestionInputSchema', () => {
    it('accepts an apply op with a null expectedCurrent', () => {
      const parsed = applyVideoSuggestionInputSchema.safeParse({
        suggestionId: OBJECT_ID,
        op: 'apply',
        expectedCurrent: null,
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts a dismiss op without expectedCurrent', () => {
      const parsed = applyVideoSuggestionInputSchema.safeParse({
        suggestionId: OBJECT_ID,
        op: 'dismiss',
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects an unknown op', () => {
      const parsed = applyVideoSuggestionInputSchema.safeParse({
        suggestionId: OBJECT_ID,
        op: 'revert',
      });
      expect(parsed.success).toBe(false);
    });
  });
});
