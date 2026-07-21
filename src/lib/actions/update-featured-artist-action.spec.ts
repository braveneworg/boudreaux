/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { FeaturedArtistsService } from '@/lib/services/featured-artists-service';
import { EMPTY_FORM_STATE } from '@/lib/types/form-state';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';
import { cache } from '@/lib/utils/simple-cache';

import { updateFeaturedArtistAction } from './update-featured-artist-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/featured-artists-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');
vi.mock('@/lib/utils/simple-cache', () => ({
  cache: { deleteByPrefix: vi.fn() },
}));

const ID = '507f1f77bcf86cd799439011';
const ARTIST_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ARTIST_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const DIGITAL_FORMAT_ID = 'cccccccccccccccccccccccc';
const RELEASE_ID = 'dddddddddddddddddddddddd';

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };

/** Builds the FormData the featured-artist form submits for an edit. */
const buildPayload = (
  overrides: Record<string, string> = {},
  artistIds: string[] = [ARTIST_A]
): FormData => {
  const payload = new FormData();
  const fields: Record<string, string> = {
    displayName: 'Alpha',
    description: 'A description',
    coverArt: 'https://cdn.example.com/cover.jpg',
    position: '3',
    featuredOn: '2026-07-01',
    featuredUntil: '2026-08-01',
    digitalFormatId: DIGITAL_FORMAT_ID,
    releaseId: RELEASE_ID,
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) {
    payload.append(key, value);
  }
  for (const artistId of artistIds) {
    payload.append('artistIds', artistId);
  }
  return payload;
};

/** The update payload handed to the service on the most recent call. */
const lastUpdateData = () =>
  vi.mocked(FeaturedArtistsService.updateFeaturedArtist).mock.calls[0][1];

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(FeaturedArtistsService.updateFeaturedArtist).mockResolvedValue({
    success: true,
    data: { id: ID },
  } as never);
});

describe('updateFeaturedArtistAction', () => {
  it('requires an admin session', async () => {
    vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

    await expect(updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload())).rejects.toThrow(
      'Unauthorized'
    );
  });

  it('reports success with the featured artist id', async () => {
    const result = await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload());

    expect(result).toMatchObject({ success: true, data: { featuredArtistId: ID } });
  });

  it('updates the featured artist addressed by id', async () => {
    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload());

    expect(FeaturedArtistsService.updateFeaturedArtist).toHaveBeenCalledWith(
      ID,
      expect.any(Object)
    );
  });

  it('clears errors on success', async () => {
    const result = await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload());

    expect(result.errors).toBeUndefined();
  });

  // The route handler this replaced translated `artistIds` into a relation
  // `set`, which replaces the connected artists rather than appending.
  it('replaces the connected artists with the submitted ids', async () => {
    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload({}, [ARTIST_A, ARTIST_B]));

    expect(lastUpdateData()).toMatchObject({
      artists: { set: [{ id: ARTIST_A }, { id: ARTIST_B }] },
    });
  });

  it('omits the artist relation entirely when no ids are submitted', async () => {
    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload({}, []));

    expect(lastUpdateData()).not.toHaveProperty('artists');
  });

  it('converts featuredOn to a Date', async () => {
    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload());

    expect(lastUpdateData()).toMatchObject({ featuredOn: new Date('2026-07-01') });
  });

  it('converts featuredUntil to a Date', async () => {
    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload());

    expect(lastUpdateData()).toMatchObject({ featuredUntil: new Date('2026-08-01') });
  });

  // A blank date must not be reinterpreted as "now" — that would silently
  // re-stamp the feature window on every save.
  it('leaves featuredOn unwritten when submitted blank', async () => {
    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload({ featuredOn: '' }));

    expect(lastUpdateData().featuredOn).toBeUndefined();
  });

  it('leaves featuredUntil unwritten when submitted blank', async () => {
    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload({ featuredUntil: '' }));

    expect(lastUpdateData().featuredUntil).toBeUndefined();
  });

  // Unlike the create action, an update must never stamp publishedOn — doing so
  // would publish a draft entry as a side effect of an unrelated edit.
  it('never writes publishedOn', async () => {
    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload());

    expect(lastUpdateData()).not.toHaveProperty('publishedOn');
  });

  it('coerces the numeric position from its form string', async () => {
    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload({ position: '7' }));

    expect(lastUpdateData()).toMatchObject({ position: 7 });
  });

  it('connects the digital format by id', async () => {
    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload());

    expect(lastUpdateData()).toMatchObject({
      digitalFormat: { connect: { id: DIGITAL_FORMAT_ID } },
    });
  });

  it('connects the release by id', async () => {
    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload());

    expect(lastUpdateData()).toMatchObject({ release: { connect: { id: RELEASE_ID } } });
  });

  it('maps a blank optional string to undefined rather than writing an empty value', async () => {
    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload({ description: '' }));

    expect(lastUpdateData().description).toBeUndefined();
  });

  it('rejects an invalid payload without calling the service', async () => {
    await updateFeaturedArtistAction(
      ID,
      EMPTY_FORM_STATE,
      buildPayload({ displayName: 'x'.repeat(201) })
    );

    expect(FeaturedArtistsService.updateFeaturedArtist).not.toHaveBeenCalled();
  });

  it('reports field errors for an invalid payload', async () => {
    const result = await updateFeaturedArtistAction(
      ID,
      EMPTY_FORM_STATE,
      buildPayload({ displayName: 'x'.repeat(201) })
    );

    expect(result.success).toBe(false);
  });

  it('surfaces a service failure on the form state', async () => {
    vi.mocked(FeaturedArtistsService.updateFeaturedArtist).mockResolvedValue({
      success: false,
      error: 'Featured artist not found',
    } as never);

    const result = await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload());

    expect(result).toMatchObject({
      success: false,
      errors: { general: ['Featured artist not found'] },
    });
  });

  it('fails softly when the service throws', async () => {
    vi.mocked(FeaturedArtistsService.updateFeaturedArtist).mockRejectedValue(Error('boom'));

    const result = await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload());

    expect(result.success).toBe(false);
  });

  it('logs the update audit event', async () => {
    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload());

    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'media.featured_artist.updated',
        userId: 'user-123',
        metadata: expect.objectContaining({ featuredArtistId: ID, success: true }),
      })
    );
  });

  it('revalidates the admin featured-artists listing', async () => {
    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload());

    expect(revalidatePath).toHaveBeenCalledWith('/admin/featured-artists');
  });

  // The landing-page carousel reads through the featured-artists cache, so a
  // successful edit has to drop it or the change is invisible until it expires.
  it('drops the featured-artists cache on success', async () => {
    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload());

    expect(cache.deleteByPrefix).toHaveBeenCalledWith('featured-artists:');
  });

  it('revalidates the landing page on success', async () => {
    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload());

    expect(revalidatePath).toHaveBeenCalledWith('/');
  });

  it('does not drop the cache when the update fails', async () => {
    vi.mocked(FeaturedArtistsService.updateFeaturedArtist).mockResolvedValue({
      success: false,
      error: 'Featured artist not found',
    } as never);

    await updateFeaturedArtistAction(ID, EMPTY_FORM_STATE, buildPayload());

    expect(cache.deleteByPrefix).not.toHaveBeenCalled();
  });
});
