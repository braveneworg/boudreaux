/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { videoDraftSchema } from './video-draft-schema';

const validDraft = {
  preGeneratedId: '65a1b2c3d4e5f6a7b8c9d0e1',
  s3Key: 'media/videos/65a1b2c3d4e5f6a7b8c9d0e1/x.mp4',
  fileName: 'x.mp4',
  mimeType: 'video/mp4' as const,
};

describe('videoDraftSchema', () => {
  it('requires only the upload triple and the id', () => {
    const parsed = videoDraftSchema.safeParse(validDraft);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.category).toBe('MUSIC'); // defaulted
  });

  it('rejects a malformed id', () => {
    expect(
      videoDraftSchema.safeParse({
        preGeneratedId: 'nope',
        s3Key: 'k',
        fileName: 'f',
        mimeType: 'video/mp4',
      }).success
    ).toBe(false);
  });

  it('rejects an unknown mime type', () => {
    expect(
      videoDraftSchema.safeParse({
        preGeneratedId: '65a1b2c3d4e5f6a7b8c9d0e1',
        s3Key: 'k',
        fileName: 'f',
        mimeType: 'text/html',
      }).success
    ).toBe(false);
  });

  it('accepts posterUrl and posterCandidates', () => {
    const parsed = videoDraftSchema.safeParse({
      ...validDraft,
      posterUrl: 'https://cdn.example.com/media/videos/vid1/poster-candidate-1.jpg',
      posterCandidates: [
        {
          url: 'https://cdn.example.com/media/videos/vid1/poster-candidate-1.jpg',
          atSeconds: 3.7,
          score: 12.5,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a javascript: scheme in posterUrl', () => {
    expect(
      videoDraftSchema.safeParse({
        ...validDraft,
        posterUrl: 'javascript:alert(1)',
      }).success
    ).toBe(false);
  });
});
