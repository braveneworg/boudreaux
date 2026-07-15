/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { videoArtistDetailSchema } from './video-artist-detail-schema';

describe('videoArtistDetailSchema', () => {
  it('parses a valid full object and trims sourceName', () => {
    const result = videoArtistDetailSchema.parse({
      sourceName: '  Zora Quill Brandt  ',
      firstName: 'Zora',
      middleName: 'Quill',
      surname: 'Brandt',
      displayName: 'Zora Quill Brandt',
    });

    expect(result).toEqual({
      sourceName: 'Zora Quill Brandt',
      firstName: 'Zora',
      middleName: 'Quill',
      surname: 'Brandt',
      displayName: 'Zora Quill Brandt',
    });
  });

  it('rejects a missing sourceName', () => {
    const result = videoArtistDetailSchema.safeParse({
      firstName: 'Zora',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an empty sourceName', () => {
    const result = videoArtistDetailSchema.safeParse({ sourceName: '' });

    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only sourceName', () => {
    const result = videoArtistDetailSchema.safeParse({ sourceName: '   ' });

    expect(result.success).toBe(false);
  });

  it('rejects a 201-char sourceName', () => {
    const result = videoArtistDetailSchema.safeParse({ sourceName: 'x'.repeat(201) });

    expect(result.success).toBe(false);
  });

  it('parses with only sourceName when all four name fields are omitted', () => {
    const result = videoArtistDetailSchema.safeParse({ sourceName: 'X' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ sourceName: 'X' });
  });

  it('rejects a 101-char firstName', () => {
    const result = videoArtistDetailSchema.safeParse({
      sourceName: 'Test',
      firstName: 'a'.repeat(101),
    });

    expect(result.success).toBe(false);
  });

  it('rejects a 101-char middleName', () => {
    const result = videoArtistDetailSchema.safeParse({
      sourceName: 'Test',
      middleName: 'a'.repeat(101),
    });

    expect(result.success).toBe(false);
  });

  it('rejects a 101-char surname', () => {
    const result = videoArtistDetailSchema.safeParse({
      sourceName: 'Test',
      surname: 'a'.repeat(101),
    });

    expect(result.success).toBe(false);
  });

  it('rejects a 201-char displayName', () => {
    const result = videoArtistDetailSchema.safeParse({
      sourceName: 'Test',
      displayName: 'a'.repeat(201),
    });

    expect(result.success).toBe(false);
  });
});
