/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { GeneratedBioContent } from '@/lib/validation/bio-generation-schema';

import { generateArtistBioAction } from './generate-artist-bio-action';

vi.mock('server-only', () => ({}));

const revalidatePathMock = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePathMock(path) }));

const logSecurityEventMock = vi.fn();
vi.mock('@/utils/audit-log', () => ({ logSecurityEvent: (e: unknown) => logSecurityEventMock(e) }));

const requireRoleMock = vi.fn();
vi.mock('@/lib/utils/auth/require-role', () => ({
  requireRole: (role: string) => requireRoleMock(role),
}));

const generateForArtistMock = vi.fn();
vi.mock('@/lib/services/bio-generation-service', () => ({
  BioGenerationService: {
    generateForArtist: (id: string, opts: unknown) => generateForArtistMock(id, opts),
  },
}));

const loggerErrorMock = vi.fn();
vi.mock('@/lib/utils/logger', () => ({
  loggers: {
    media: {
      error: (...args: unknown[]) => loggerErrorMock(...args),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  },
}));

const VALID_ID = 'a'.repeat(24);

const content: GeneratedBioContent = {
  shortBio: 'Short teaser',
  longBio: '<p>Long</p>',
  genres: 'art rock',
  images: [
    {
      url: 'https://upload.wikimedia.org/a.jpg',
      thumbnailUrl: null,
      title: 'Portrait',
      attribution: 'Photographer',
      license: 'CC BY-SA 4.0',
      sourceUrl: null,
      isPrimary: true,
    },
  ],
  links: [
    { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Radiohead', kind: 'wikipedia' },
  ],
  model: 'llama-3.3-70b-versatile',
};

beforeEach(() => {
  requireRoleMock.mockResolvedValue({ user: { id: 'admin-1' } });
  generateForArtistMock.mockResolvedValue({ success: true, data: content, slug: 'radiohead' });
});

describe('generateArtistBioAction', () => {
  it('rejects when the caller is not an admin', async () => {
    requireRoleMock.mockRejectedValue(new Error('Unauthorized'));

    await expect(generateArtistBioAction({ artistId: VALID_ID })).rejects.toThrow('Unauthorized');
  });

  it('returns an error for invalid input without calling the service', async () => {
    const result = await generateArtistBioAction({ artistId: 'not-an-id' });

    expect(result).toEqual({ success: false, error: 'Invalid bio generation request.' });
    expect(generateForArtistMock).not.toHaveBeenCalled();
  });

  it('delegates to the service with the validated input', async () => {
    await generateArtistBioAction({
      artistId: VALID_ID,
      links: ['https://example.com'],
      description: 'x',
    });

    expect(generateForArtistMock).toHaveBeenCalledWith(VALID_ID, {
      links: ['https://example.com'],
      description: 'x',
    });
  });

  it('audits and revalidates the artist pages on success', async () => {
    const result = await generateArtistBioAction({ artistId: VALID_ID });

    expect(result).toEqual({ success: true, data: content });
    expect(logSecurityEventMock).toHaveBeenCalledTimes(1);
    const revalidated = revalidatePathMock.mock.calls.map(([path]) => path);
    expect(revalidated).toContain('/artists/radiohead');
    expect(revalidated).toContain('/artists/radiohead/bio');
  });

  it('returns the service error without auditing or revalidating', async () => {
    generateForArtistMock.mockResolvedValue({ success: false, error: 'Artist not found.' });

    const result = await generateArtistBioAction({ artistId: VALID_ID });

    expect(result).toEqual({ success: false, error: 'Artist not found.' });
    expect(logSecurityEventMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('returns a typed error instead of a 500 when the service throws unexpectedly', async () => {
    generateForArtistMock.mockRejectedValue(new Error('PrismaClientInitializationError: DB down'));

    const result = await generateArtistBioAction({ artistId: VALID_ID });

    expect(result).toEqual({
      success: false,
      error: 'Bio generation failed unexpectedly. Please try again.',
    });
  });

  it('logs the unexpected error so it stays observable (not a silent 500)', async () => {
    generateForArtistMock.mockRejectedValue(new Error('DB down'));

    await generateArtistBioAction({ artistId: VALID_ID });

    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
  });
});
