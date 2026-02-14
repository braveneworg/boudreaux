import { extractS3KeyFromUrl } from './s3-key-utils';

describe('extractS3KeyFromUrl', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('CDN URLs', () => {
    it('should extract S3 key from a CDN URL', () => {
      process.env.CDN_DOMAIN = 'cdn.example.com';
      const url = 'https://cdn.example.com/media/tracks/abc123/song.mp3';
      expect(extractS3KeyFromUrl(url)).toBe('media/tracks/abc123/song.mp3');
    });

    it('should handle CDN_DOMAIN with protocol prefix', () => {
      process.env.CDN_DOMAIN = 'https://cdn.example.com';
      const url = 'https://cdn.example.com/media/releases/img.jpg';
      expect(extractS3KeyFromUrl(url)).toBe('media/releases/img.jpg');
    });

    it('should handle malformed URLs with double https://', () => {
      process.env.CDN_DOMAIN = 'cdn.example.com';
      const url = 'https://https://cdn.example.com/media/artists/photo.png';
      expect(extractS3KeyFromUrl(url)).toBe('media/artists/photo.png');
    });
  });

  describe('S3 URLs', () => {
    it('should extract S3 key from an S3 URL', () => {
      process.env.CDN_DOMAIN = '';
      const url = 'https://my-bucket.s3.us-east-1.amazonaws.com/media/tracks/abc/song.mp3';
      expect(extractS3KeyFromUrl(url)).toBe('media/tracks/abc/song.mp3');
    });

    it('should extract S3 key with nested path segments', () => {
      process.env.CDN_DOMAIN = '';
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
      process.env.CDN_DOMAIN = '';
      const url = 'https://other-service.example.com/some/path';
      expect(extractS3KeyFromUrl(url)).toBeNull();
    });

    it('should return null when CDN_DOMAIN is not set and URL is not S3', () => {
      delete process.env.CDN_DOMAIN;
      const url = 'https://not-s3.example.com/path/to/file.mp3';
      expect(extractS3KeyFromUrl(url)).toBeNull();
    });

    it('should prefer CDN extraction when CDN_DOMAIN matches', () => {
      process.env.CDN_DOMAIN = 'cdn.example.com';
      const url = 'https://cdn.example.com/media/tracks/special-file.wav';
      expect(extractS3KeyFromUrl(url)).toBe('media/tracks/special-file.wav');
    });
  });
});
