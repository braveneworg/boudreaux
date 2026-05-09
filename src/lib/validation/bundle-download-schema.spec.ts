/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  bundleDownloadQuerySchema,
  CapReachedErrorResponseSchema,
  FreeStatusResponseSchema,
  LockHeldErrorResponseSchema,
  NoFreeFormatsErrorResponseSchema,
} from './bundle-download-schema';

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

  describe('mode', () => {
    it('defaults mode to paid when omitted', () => {
      const parsed = bundleDownloadQuerySchema.parse({ formats: 'FLAC' });
      expect(parsed.mode).toBe('paid');
    });

    it('accepts mode=paid with any valid formats', () => {
      const result = bundleDownloadQuerySchema.safeParse({
        formats: 'FLAC,WAV',
        mode: 'paid',
      });
      expect(result.success).toBe(true);
    });

    it('accepts mode=free with only free format types', () => {
      const result = bundleDownloadQuerySchema.safeParse({
        formats: 'MP3_320KBPS,AAC',
        mode: 'free',
      });
      expect(result.success).toBe(true);
    });

    it('rejects mode=free when a non-free format is requested', () => {
      const result = bundleDownloadQuerySchema.safeParse({
        formats: 'FLAC',
        mode: 'free',
      });
      expect(result.success).toBe(false);
      const issues = result.success ? [] : result.error.issues;
      const issue = issues.find((i) => i.code === 'custom' && i.path.includes('formats')) as
        | { params?: { code?: string; invalid?: string[] } }
        | undefined;
      expect(issue?.params?.code).toBe('INVALID_FORMATS');
      expect(issue?.params?.invalid).toEqual(['FLAC']);
    });

    it('rejects mode=free when any of several formats is non-free', () => {
      const result = bundleDownloadQuerySchema.safeParse({
        formats: 'MP3_320KBPS,WAV,AAC',
        mode: 'free',
      });
      expect(result.success).toBe(false);
      const issues = result.success ? [] : result.error.issues;
      const issue = issues.find((i) => i.code === 'custom' && i.path.includes('formats')) as
        | { params?: { invalid?: string[] } }
        | undefined;
      expect(issue?.params?.invalid).toEqual(['WAV']);
    });

    it('rejects an unknown mode value', () => {
      const result = bundleDownloadQuerySchema.safeParse({
        formats: 'FLAC',
        mode: 'gift',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('FreeStatusResponseSchema', () => {
    it('accepts a valid allowed=true payload with availableFreeFormats', () => {
      const result = FreeStatusResponseSchema.safeParse({
        allowed: true,
        remaining: 2,
        windowSeconds: 86_400,
        resetsAtIso: null,
        blockedReason: null,
        availableFreeFormats: ['MP3_320KBPS', 'AAC'],
      });
      expect(result.success).toBe(true);
    });

    it('accepts a cap-reached payload with resetsAtIso set', () => {
      const result = FreeStatusResponseSchema.safeParse({
        allowed: false,
        remaining: 0,
        windowSeconds: 86_400,
        resetsAtIso: '2026-05-08T18:00:00.000Z',
        blockedReason: 'cap-reached',
        availableFreeFormats: ['MP3_320KBPS'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects remaining > 3', () => {
      const result = FreeStatusResponseSchema.safeParse({
        allowed: true,
        remaining: 4,
        windowSeconds: 86_400,
        resetsAtIso: null,
        blockedReason: null,
        availableFreeFormats: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects remaining < 0', () => {
      const result = FreeStatusResponseSchema.safeParse({
        allowed: false,
        remaining: -1,
        windowSeconds: 86_400,
        resetsAtIso: null,
        blockedReason: 'cap-reached',
        availableFreeFormats: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects windowSeconds other than 86400', () => {
      const result = FreeStatusResponseSchema.safeParse({
        allowed: true,
        remaining: 3,
        windowSeconds: 3_600,
        resetsAtIso: null,
        blockedReason: null,
        availableFreeFormats: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown blockedReason values', () => {
      const result = FreeStatusResponseSchema.safeParse({
        allowed: false,
        remaining: 0,
        windowSeconds: 86_400,
        resetsAtIso: '2026-05-08T18:00:00.000Z',
        blockedReason: 'maintenance',
        availableFreeFormats: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects FLAC in availableFreeFormats', () => {
      const result = FreeStatusResponseSchema.safeParse({
        allowed: true,
        remaining: 3,
        windowSeconds: 86_400,
        resetsAtIso: null,
        blockedReason: null,
        availableFreeFormats: ['FLAC'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('CapReachedErrorResponseSchema', () => {
    it('accepts a valid CAP_REACHED body with resetsAtIso', () => {
      const result = CapReachedErrorResponseSchema.safeParse({
        errorCode: 'CAP_REACHED',
        message: 'Free-download cap reached',
        resetsAtIso: '2026-05-08T18:00:00.000Z',
      });
      expect(result.success).toBe(true);
    });

    it('rejects payloads missing resetsAtIso', () => {
      const result = CapReachedErrorResponseSchema.safeParse({
        errorCode: 'CAP_REACHED',
        message: 'Free-download cap reached',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('LockHeldErrorResponseSchema', () => {
    it('accepts a valid LOCK_HELD body', () => {
      const result = LockHeldErrorResponseSchema.safeParse({
        errorCode: 'LOCK_HELD',
        message: 'Another preparation is in progress',
      });
      expect(result.success).toBe(true);
    });

    it('rejects payloads with the wrong errorCode', () => {
      const result = LockHeldErrorResponseSchema.safeParse({
        errorCode: 'CAP_REACHED',
        message: 'foo',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('NoFreeFormatsErrorResponseSchema', () => {
    it('accepts a valid NO_FREE_FORMATS_AVAILABLE body', () => {
      const result = NoFreeFormatsErrorResponseSchema.safeParse({
        errorCode: 'NO_FREE_FORMATS_AVAILABLE',
        message: 'No free formats available for this release',
      });
      expect(result.success).toBe(true);
    });
  });
});
