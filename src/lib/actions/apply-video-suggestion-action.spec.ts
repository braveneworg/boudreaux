// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { VideoArtistRepository } from '@/lib/repositories/video-artist-repository';
import { VideoEnrichmentSuggestionRepository } from '@/lib/repositories/video-enrichment-suggestion-repository';
import { ArtistService } from '@/lib/services/artist-service';
import type { VideoEnrichmentSuggestionRecord } from '@/lib/types/domain/video-enrichment';
import { requireRole } from '@/lib/utils/auth/require-role';
import { logSecurityEvent } from '@/utils/audit-log';

import { applyVideoSuggestionAction } from './apply-video-suggestion-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/utils/auth/require-role', () => ({ requireRole: vi.fn() }));
vi.mock('@/utils/audit-log', () => ({ logSecurityEvent: vi.fn() }));
vi.mock('@/lib/repositories/video-enrichment-suggestion-repository', () => ({
  VideoEnrichmentSuggestionRepository: {
    findById: vi.fn(),
    markApplied: vi.fn(),
    markDismissed: vi.fn(),
  },
}));
vi.mock('@/lib/repositories/video-artist-repository', () => ({
  VideoArtistRepository: { findByVideoId: vi.fn() },
}));
vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: { applyEnrichedField: vi.fn() },
}));
vi.mock('@/lib/utils/logger', () => ({
  loggers: new Proxy(
    {},
    { get: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }
  ),
}));

const VIDEO_ID = 'f'.repeat(24);
const ARTIST_ID = 'a'.repeat(24);
const SUGGESTION_ID = 'c'.repeat(24);

const suggestion = (
  overrides: Partial<VideoEnrichmentSuggestionRecord> = {}
): VideoEnrichmentSuggestionRecord => ({
  id: SUGGESTION_ID,
  videoId: VIDEO_ID,
  artistId: ARTIST_ID,
  field: 'bornOn',
  value: '1985-03-15',
  confidence: 'high',
  sources: [],
  note: null,
  status: 'pending',
  appliedAt: null,
  appliedBy: null,
  createdAt: new Date(),
  ...overrides,
});

const artistRow = {
  artistId: ARTIST_ID,
  role: 'PRIMARY' as const,
  sortOrder: 0,
  artist: {
    displayName: 'Ceschi',
    firstName: 'Francisco',
    middleName: null,
    surname: 'Ramos',
    akaNames: null,
    bornOn: new Date('1980-01-02T00:00:00.000Z'),
  },
};

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue({ user: { id: 'admin-1', role: 'admin' } } as never);
  vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(suggestion());
  vi.mocked(VideoEnrichmentSuggestionRepository.markApplied).mockResolvedValue(true);
  vi.mocked(VideoEnrichmentSuggestionRepository.markDismissed).mockResolvedValue(true);
  vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([artistRow]);
  vi.mocked(ArtistService.applyEnrichedField).mockResolvedValue(undefined);
});

describe('applyVideoSuggestionAction', () => {
  it('rejects invalid input', async () => {
    const result = await applyVideoSuggestionAction({ suggestionId: 'nope', op: 'apply' });

    expect(result).toEqual({ success: false, error: 'Invalid suggestion request.' });
  });

  it('dismisses a pending suggestion', async () => {
    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'dismiss',
    });

    expect(result).toEqual({ success: true, op: 'dismiss' });
    expect(VideoEnrichmentSuggestionRepository.markDismissed).toHaveBeenCalledWith(SUGGESTION_ID);
  });

  it('reports an already-resolved dismiss', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.markDismissed).mockResolvedValue(false);

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'dismiss',
    });

    expect(result).toEqual({ success: false, error: 'Suggestion was already resolved.' });
  });

  it('applies a pending artist suggestion through the field whitelist', async () => {
    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
    });

    expect(result).toEqual({ success: true, op: 'apply' });
    expect(ArtistService.applyEnrichedField).toHaveBeenCalledWith(
      ARTIST_ID,
      'bornOn',
      '1985-03-15',
      'admin-1'
    );
    expect(VideoEnrichmentSuggestionRepository.markApplied).toHaveBeenCalledWith(
      SUGGESTION_ID,
      'admin-1'
    );
  });

  it('refuses to server-apply a releasedOn suggestion (client-side only)', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(
      suggestion({ artistId: null, field: 'releasedOn', value: '2020-06-01' })
    );

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
    });

    expect(result).toEqual({
      success: false,
      error: 'The release date applies in the edit form, not on the server.',
    });
    expect(ArtistService.applyEnrichedField).not.toHaveBeenCalled();
  });

  it('rejects an impossible calendar month for bornOn (2020-13-45)', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(
      suggestion({ value: '2020-13-45' })
    );

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
    });

    expect(result).toEqual({ success: false, error: 'Suggested value is not a valid date.' });
  });

  it('rejects an impossible calendar day for bornOn (2021-02-30)', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(
      suggestion({ value: '2021-02-30' })
    );

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
    });

    expect(result).toEqual({ success: false, error: 'Suggested value is not a valid date.' });
  });

  it('rejects a zero month for bornOn (2021-00-10)', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(
      suggestion({ value: '2021-00-10' })
    );

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
    });

    expect(result).toEqual({ success: false, error: 'Suggested value is not a valid date.' });
  });

  it('rejects non-date junk for bornOn', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(
      suggestion({ value: 'not-a-date' })
    );

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
    });

    expect(result).toEqual({ success: false, error: 'Suggested value is not a valid date.' });
    expect(ArtistService.applyEnrichedField).not.toHaveBeenCalled();
  });

  it('accepts a real calendar leap day for bornOn (2020-02-29)', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(
      suggestion({ value: '2020-02-29' })
    );

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
    });

    expect(result).toEqual({ success: true, op: 'apply' });
  });

  it('refuses a non-pending suggestion', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(
      suggestion({ status: 'applied' })
    );

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
    });

    expect(result).toEqual({ success: false, error: 'Suggestion was already resolved.' });
  });

  it('conflicts when expectedCurrent no longer matches (day-precision dates)', async () => {
    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
      expectedCurrent: '1979-12-31',
    });

    expect(result).toEqual({
      success: false,
      error: 'The current value has changed — review before applying.',
    });
    expect(ArtistService.applyEnrichedField).not.toHaveBeenCalled();
  });

  it('applies when expectedCurrent matches the current value', async () => {
    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
      expectedCurrent: '1980-01-02',
    });

    expect(result).toEqual({ success: true, op: 'apply' });
  });

  it('conflicts when expectedCurrent is null but the field now has a value', async () => {
    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
      expectedCurrent: null,
    });

    expect(result).toEqual({
      success: false,
      error: 'The current value has changed — review before applying.',
    });
  });

  it('applies a surname suggestion, matching the current surname', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(
      suggestion({ field: 'surname', value: 'Ramirez' })
    );

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
      expectedCurrent: 'Ramos',
    });

    expect(result).toEqual({ success: true, op: 'apply' });
    expect(ArtistService.applyEnrichedField).toHaveBeenCalledWith(
      ARTIST_ID,
      'surname',
      'Ramirez',
      'admin-1'
    );
  });

  it('applies a firstName suggestion, matching the current first name', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(
      suggestion({ field: 'firstName', value: 'Frank' })
    );

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
      expectedCurrent: 'Francisco',
    });

    expect(result).toEqual({ success: true, op: 'apply' });
  });

  it('applies a displayName suggestion, matching the current display name', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(
      suggestion({ field: 'displayName', value: 'Ceschi Ramos' })
    );

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
      expectedCurrent: 'Ceschi',
    });

    expect(result).toEqual({ success: true, op: 'apply' });
  });

  it('applies a middleName suggestion when the current middle name is empty', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(
      suggestion({ field: 'middleName', value: 'Q' })
    );

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
      expectedCurrent: null,
    });

    expect(result).toEqual({ success: true, op: 'apply' });
  });

  it('applies an akaNames suggestion when the current aka is empty', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(
      suggestion({ field: 'akaNames', value: 'The Alias' })
    );

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
      expectedCurrent: null,
    });

    expect(result).toEqual({ success: true, op: 'apply' });
  });

  it('rejects a whitelisted field with no linked artist id as unsupported', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(
      suggestion({ field: 'surname', artistId: null, value: 'Ramirez' })
    );

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
    });

    expect(result).toEqual({ success: false, error: 'Unsupported suggestion field.' });
  });

  it('rejects a non-whitelisted field as unsupported', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockResolvedValue(
      suggestion({ field: 'nickname', value: 'Chi' })
    );

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
    });

    expect(result).toEqual({ success: false, error: 'Unsupported suggestion field.' });
  });

  it('errors when the artist is no longer linked to the video', async () => {
    vi.mocked(VideoArtistRepository.findByVideoId).mockResolvedValue([]);

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
    });

    expect(result).toEqual({
      success: false,
      error: 'Artist is no longer linked to this video.',
    });
  });

  it('reports already-resolved when the atomic markApplied loses the race', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.markApplied).mockResolvedValue(false);

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
    });

    expect(result).toEqual({ success: false, error: 'Suggestion was already resolved.' });
  });

  it('audits and revalidates the admin paths after an apply', async () => {
    await applyVideoSuggestionAction({ suggestionId: SUGGESTION_ID, op: 'apply' });

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.artist.updated',
      userId: 'admin-1',
      metadata: {
        artistId: ARTIST_ID,
        videoId: VIDEO_ID,
        field: 'bornOn',
        action: 'enrichment-suggestion-applied',
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/videos');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/artists');
  });

  it('returns a typed error when a repository throws', async () => {
    vi.mocked(VideoEnrichmentSuggestionRepository.findById).mockRejectedValue(new Error('db down'));

    const result = await applyVideoSuggestionAction({
      suggestionId: SUGGESTION_ID,
      op: 'apply',
    });

    expect(result).toEqual({
      success: false,
      error: 'Suggestion update failed. Please try again.',
    });
  });
});
