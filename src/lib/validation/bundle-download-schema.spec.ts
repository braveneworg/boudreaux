/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { bundleDownloadQuerySchema } from './bundle-download-schema';

describe('bundleDownloadQuerySchema', () => {
  it('should accept a single valid format', () => {
    const result = bundleDownloadQuerySchema.safeParse({ formats: 'FLAC' });

    expect(result.success).toBe(true);

    const parsed = bundleDownloadQuerySchema.parse({ formats: 'FLAC' });
    expect(parsed.formats).toEqual(['FLAC']);
  });

  it('should accept multiple comma-separated valid formats', () => {
    const result = bundleDownloadQuerySchema.safeParse({ formats: 'FLAC,WAV,MP3_320KBPS' });

    expect(result.success).toBe(true);

    const parsed = bundleDownloadQuerySchema.parse({ formats: 'FLAC,WAV,MP3_320KBPS' });
    expect(parsed.formats).toEqual(['FLAC', 'WAV', 'MP3_320KBPS']);
  });

  it('should accept all valid format types', () => {
    const allFormats = 'MP3_V0,MP3_320KBPS,AAC,OGG_VORBIS,FLAC,ALAC,WAV,AIFF';
    const result = bundleDownloadQuerySchema.safeParse({ formats: allFormats });

    expect(result.success).toBe(true);

    const parsed = bundleDownloadQuerySchema.parse({ formats: allFormats });
    expect(parsed.formats).toHaveLength(8);
  });

  it('should reject an empty string', () => {
    const result = bundleDownloadQuerySchema.safeParse({ formats: '' });

    expect(result.success).toBe(false);
  });

  it('should reject an invalid format type', () => {
    const result = bundleDownloadQuerySchema.safeParse({ formats: 'INVALID_FORMAT' });

    expect(result.success).toBe(false);
  });

  it('should reject when one of multiple formats is invalid', () => {
    const result = bundleDownloadQuerySchema.safeParse({ formats: 'FLAC,BADFORMAT,WAV' });

    expect(result.success).toBe(false);
  });

  it('should reject null formats', () => {
    const result = bundleDownloadQuerySchema.safeParse({ formats: null });

    expect(result.success).toBe(false);
  });

  it('should reject undefined formats', () => {
    const result = bundleDownloadQuerySchema.safeParse({});

    expect(result.success).toBe(false);
  });
});
