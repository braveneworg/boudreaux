/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { buildMediaS3Key, extractS3KeyFromUrl } from './s3-key-utils';

describe('extractS3KeyFromUrl', () => {
  // Per-test env stubs are restored by the global afterEach in setupTests.ts.

  describe('CDN URLs', () => {
    it('should extract S3 key from a CDN URL', () => {
      vi.stubEnv('CDN_DOMAIN', 'cdn.example.com');
      const url = 'https://cdn.example.com/media/tracks/abc123/song.mp3';
      expect(extractS3KeyFromUrl(url)).toBe('media/tracks/abc123/song.mp3');
    });

    it('should handle CDN_DOMAIN with protocol prefix', () => {
      vi.stubEnv('CDN_DOMAIN', 'https://cdn.example.com');
      const url = 'https://cdn.example.com/media/releases/img.jpg';
      expect(extractS3KeyFromUrl(url)).toBe('media/releases/img.jpg');
    });

    it('should handle malformed URLs with double https://', () => {
      vi.stubEnv('CDN_DOMAIN', 'cdn.example.com');
      const url = 'https://https://cdn.example.com/media/artists/photo.png';
      expect(extractS3KeyFromUrl(url)).toBe('media/artists/photo.png');
    });
  });

  describe('S3 URLs', () => {
    it('should extract S3 key from an S3 URL', () => {
      vi.stubEnv('CDN_DOMAIN', '');
      const url = 'https://my-bucket.s3.us-east-1.amazonaws.com/media/tracks/abc/song.mp3';
      expect(extractS3KeyFromUrl(url)).toBe('media/tracks/abc/song.mp3');
    });

    it('should extract S3 key with nested path segments', () => {
      vi.stubEnv('CDN_DOMAIN', '');
      const url = 'https://bucket.s3.eu-west-1.amazonaws.com/a/b/c/d.flac';
      expect(extractS3KeyFromUrl(url)).toBe('a/b/c/d.flac');
    });
  });

  describe('edge cases', () => {
    it('should return null for empty string', () => {
      expect(extractS3KeyFromUrl('')).toBeNull();
    });

    it('should return null for pending://upload placeholder', () => {
      expect(extractS3KeyFromUrl('pending://upload')).toBeNull();
    });

    it('should return null for unrecognizable URL without CDN_DOMAIN', () => {
      vi.stubEnv('CDN_DOMAIN', '');
      const url = 'https://other-service.example.com/some/path';
      expect(extractS3KeyFromUrl(url)).toBeNull();
    });

    it('should return null when CDN_DOMAIN is not set and URL is not S3', () => {
      vi.stubEnv('CDN_DOMAIN', undefined);
      const url = 'https://not-s3.example.com/path/to/file.mp3';
      expect(extractS3KeyFromUrl(url)).toBeNull();
    });

    it('should return null for malformed S3 URL without path after region', () => {
      vi.stubEnv('CDN_DOMAIN', '');
      const url = 'https://bucket.s3.';
      expect(extractS3KeyFromUrl(url)).toBeNull();
    });

    it('should prefer CDN extraction when CDN_DOMAIN matches', () => {
      vi.stubEnv('CDN_DOMAIN', 'cdn.example.com');
      const url = 'https://cdn.example.com/media/tracks/special-file.wav';
      expect(extractS3KeyFromUrl(url)).toBe('media/tracks/special-file.wav');
    });
  });
});

describe('buildMediaS3Key', () => {
  it('namespaces the key under the entity type and id', () => {
    const key = buildMediaS3Key({
      entityType: 'artists',
      entityId: 'a1',
      fileName: 'Portrait.JPG',
    });

    expect(key.startsWith('media/artists/a1/')).toBe(true);
  });

  it('lowercases the extension', () => {
    const key = buildMediaS3Key({ entityType: 'artists', entityId: 'a1', fileName: 'p.JPG' });

    expect(key.endsWith('.jpg')).toBe(true);
  });

  it('sanitizes the base name to url-safe characters', () => {
    const key = buildMediaS3Key({
      entityType: 'artists',
      entityId: 'a1',
      fileName: 'My Photo (final)!.png',
    });

    expect(key).toMatch(/\/my-photo-final-\d+-[a-z0-9]+\.png$/);
  });

  it('collapses runs of hyphens and trims them from the ends', () => {
    const key = buildMediaS3Key({ entityType: 'tours', entityId: 't1', fileName: '__a  b__.png' });

    expect(key).toMatch(/\/a-b-\d+-[a-z0-9]+\.png$/);
  });

  /**
   * The defect this builder exists to remove. Three of the four generators it
   * replaces appended the extension raw, so a client-supplied name could push
   * an extra path segment into the key — and those keys are later fed back to
   * deleteS3Object. Only the multipart video generator allowlisted it.
   */
  it('rejects an extension that would inject a path segment', () => {
    const key = buildMediaS3Key({
      entityType: 'artists',
      entityId: 'a1',
      fileName: 'photo.jpg/nested/evil',
    });

    expect(key.slice('media/artists/a1/'.length)).not.toContain('/');
  });

  it('falls back to the default extension when the candidate is not allowlisted', () => {
    const key = buildMediaS3Key({
      entityType: 'videos',
      entityId: 'v1',
      fileName: 'clip.mp4/evil',
      fallbackExtension: 'mp4',
    });

    expect(key.endsWith('.mp4')).toBe(true);
  });

  it('falls back when the name carries no extension at all', () => {
    const key = buildMediaS3Key({ entityType: 'artists', entityId: 'a1', fileName: 'noext' });

    expect(key.endsWith('.jpg')).toBe(true);
  });

  it('rejects an over-long extension rather than trusting it', () => {
    const key = buildMediaS3Key({
      entityType: 'artists',
      entityId: 'a1',
      fileName: 'x.thisisnotanextension',
    });

    expect(key.endsWith('.jpg')).toBe(true);
  });

  it('produces a different key for the same name on repeated calls', () => {
    const args = { entityType: 'artists', entityId: 'a1', fileName: 'p.png' } as const;

    expect(buildMediaS3Key(args)).not.toBe(buildMediaS3Key(args));
  });
});
