import {
  collectImagesFromDirectory,
  formatBytes,
  generateS3Key,
  isImageFile,
  parseArgs,
  resolvePath,
  uploadImages,
} from './upload-images';

const {
  s3ClientSendMock,
  cloudFrontSendMock,
  existsSyncMock,
  readdirSyncMock,
  statSyncMock,
  createReadStreamMock,
  mimeGetTypeMock,
  putObjectCommandMock,
  createInvalidationCommandMock,
} = vi.hoisted(() => ({
  s3ClientSendMock: vi.fn(),
  cloudFrontSendMock: vi.fn(),
  existsSyncMock: vi.fn(),
  readdirSyncMock: vi.fn(),
  statSyncMock: vi.fn(),
  createReadStreamMock: vi.fn(() => ({})),
  mimeGetTypeMock: vi.fn().mockReturnValue('image/jpeg'),
  putObjectCommandMock: vi.fn(),
  createInvalidationCommandMock: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3Client {
    send = s3ClientSendMock;
  },
  PutObjectCommand: putObjectCommandMock,
}));

vi.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: class MockCloudFrontClient {
    send = cloudFrontSendMock;
  },
  CreateInvalidationCommand: createInvalidationCommandMock,
}));

vi.mock('../src/lib/system-utils', () => ({
  existsSync: existsSyncMock,
  readdirSync: readdirSyncMock,
  statSync: statSyncMock,
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  const actualModule = actual as Record<string, unknown>;
  return {
    ...actualModule,
    default: {
      ...actualModule,
      createReadStream: createReadStreamMock,
    },
    createReadStream: createReadStreamMock,
  };
});

vi.mock('mime', () => ({
  default: {
    getType: mimeGetTypeMock,
  },
  getType: mimeGetTypeMock,
}));

describe('upload-images', () => {
  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(1099511627776)).toBe('1 TB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(5242880)).toBe('5 MB');
    });
  });

  describe('isImageFile', () => {
    it('should return true for image files', () => {
      expect(isImageFile('photo.jpg')).toBe(true);
      expect(isImageFile('image.jpeg')).toBe(true);
      expect(isImageFile('graphic.png')).toBe(true);
      expect(isImageFile('animation.gif')).toBe(true);
      expect(isImageFile('modern.webp')).toBe(true);
      expect(isImageFile('icon.svg')).toBe(true);
      expect(isImageFile('favicon.ico')).toBe(true);
      expect(isImageFile('bitmap.bmp')).toBe(true);
      expect(isImageFile('scan.tiff')).toBe(true);
      expect(isImageFile('scan.tif')).toBe(true);
      expect(isImageFile('next-gen.avif')).toBe(true);
    });

    it('should handle uppercase extensions', () => {
      expect(isImageFile('PHOTO.JPG')).toBe(true);
      expect(isImageFile('IMAGE.PNG')).toBe(true);
      expect(isImageFile('Graphics.WEBP')).toBe(true);
    });

    it('should handle mixed case extensions', () => {
      expect(isImageFile('photo.JpG')).toBe(true);
      expect(isImageFile('image.PnG')).toBe(true);
    });

    it('should return false for non-image files', () => {
      expect(isImageFile('document.pdf')).toBe(false);
      expect(isImageFile('video.mp4')).toBe(false);
      expect(isImageFile('audio.mp3')).toBe(false);
      expect(isImageFile('script.js')).toBe(false);
      expect(isImageFile('style.css')).toBe(false);
      expect(isImageFile('data.json')).toBe(false);
      expect(isImageFile('readme.txt')).toBe(false);
    });

    it('should return false for files without extensions', () => {
      expect(isImageFile('noextension')).toBe(false);
    });
  });

  describe('resolvePath', () => {
    beforeEach(() => {
      vi.spyOn(process, 'cwd').mockReturnValue('/test/workspace');
    });

    it('should return absolute paths unchanged', () => {
      const absolutePath = '/absolute/path/to/file.jpg';
      expect(resolvePath(absolutePath)).toBe(absolutePath);
    });

    it('should resolve relative paths from cwd', () => {
      const result = resolvePath('relative/path/file.jpg');
      expect(result).toBe('/test/workspace/relative/path/file.jpg');
    });

    it('should resolve ./ paths', () => {
      const result = resolvePath('./images/photo.jpg');
      expect(result).toBe('/test/workspace/images/photo.jpg');
    });

    it('should resolve ../ paths', () => {
      const result = resolvePath('../parent/file.jpg');
      expect(result).toBe('/test/parent/file.jpg');
    });

    it('should normalize paths', () => {
      const result = resolvePath('path//to///file.jpg');
      expect(result).toBe('/test/workspace/path/to/file.jpg');
    });
  });

  describe('generateS3Key', () => {
    it('should default to media/ prefix', () => {
      expect(generateS3Key('images/photo.jpg')).toBe('media/images/photo.jpg');
      expect(generateS3Key('photo.jpg')).toBe('media/photo.jpg');
    });

    it('should not double-prefix paths already starting with media/', () => {
      expect(generateS3Key('media/videos/clip.mp4')).toBe('media/videos/clip.mp4');
    });

    it('should remove public/ prefix', () => {
      expect(generateS3Key('public/media/photo.jpg')).toBe('media/photo.jpg');
      expect(generateS3Key('public/images/avatar.png')).toBe('media/images/avatar.png');
    });

    it('should remove ./ prefix', () => {
      expect(generateS3Key('./images/photo.jpg')).toBe('media/images/photo.jpg');
    });

    it('should remove leading slashes', () => {
      expect(generateS3Key('/media/photo.jpg')).toBe('media/photo.jpg');
      expect(generateS3Key('//images/photo.jpg')).toBe('media/images/photo.jpg');
    });

    it('should add prefix when provided', () => {
      expect(generateS3Key('photo.jpg', 'uploads')).toBe('uploads/photo.jpg');
      expect(generateS3Key('images/photo.jpg', 'user-content')).toBe(
        'user-content/images/photo.jpg'
      );
    });

    it('should handle prefix with slashes', () => {
      expect(generateS3Key('photo.jpg', '/uploads/')).toBe('uploads/photo.jpg');
      expect(generateS3Key('photo.jpg', 'uploads/')).toBe('uploads/photo.jpg');
      expect(generateS3Key('photo.jpg', '/uploads')).toBe('uploads/photo.jpg');
    });

    it('should handle empty prefix', () => {
      expect(generateS3Key('photo.jpg', '')).toBe('photo.jpg');
    });

    it('should convert backslashes to forward slashes', () => {
      expect(generateS3Key('images\\subfolder\\photo.jpg')).toBe(
        'media/images/subfolder/photo.jpg'
      );
      expect(generateS3Key('images\\photo.jpg', 'uploads')).toBe('uploads/images/photo.jpg');
    });

    it('should handle complex paths', () => {
      expect(generateS3Key('public/media/users/123/avatar.png', 'cdn')).toBe(
        'cdn/media/users/123/avatar.png'
      );
    });
  });

  describe('collectImagesFromDirectory', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should throw error if directory does not exist', () => {
      existsSyncMock.mockReturnValue(false);

      expect(() => collectImagesFromDirectory('/nonexistent')).toThrow(
        'Directory not found: /nonexistent'
      );
    });

    it('should throw error if path is not a directory', () => {
      existsSyncMock.mockReturnValue(true);
      statSyncMock.mockReturnValue({
        isDirectory: () => false,
        isFile: () => true,
      });

      expect(() => collectImagesFromDirectory('/path/to/file.jpg')).toThrow(
        'Not a directory: /path/to/file.jpg'
      );
    });

    it('should collect image files from directory', () => {
      existsSyncMock.mockReturnValue(true);
      statSyncMock.mockReturnValueOnce({
        isDirectory: () => true,
        isFile: () => false,
      });
      readdirSyncMock.mockReturnValue(['photo1.jpg', 'photo2.png', 'document.pdf']);

      statSyncMock.mockReturnValueOnce({
        isDirectory: () => false,
        isFile: () => true,
      });
      statSyncMock.mockReturnValueOnce({
        isDirectory: () => false,
        isFile: () => true,
      });
      statSyncMock.mockReturnValueOnce({
        isDirectory: () => false,
        isFile: () => true,
      });

      const result = collectImagesFromDirectory('/test/dir');

      expect(result).toEqual(['/test/dir/photo1.jpg', '/test/dir/photo2.png']);
      expect(result).not.toContain('/test/dir/document.pdf');
    });

    it('should recursively collect images from subdirectories', () => {
      existsSyncMock.mockReturnValue(true);

      statSyncMock.mockReturnValueOnce({
        isDirectory: () => true,
        isFile: () => false,
      });
      readdirSyncMock.mockReturnValueOnce(['subdir', 'photo1.jpg']);

      statSyncMock.mockReturnValueOnce({
        isDirectory: () => true,
        isFile: () => false,
      });

      statSyncMock.mockReturnValueOnce({
        isDirectory: () => true,
        isFile: () => false,
      });
      readdirSyncMock.mockReturnValueOnce(['photo2.png']);

      statSyncMock.mockReturnValueOnce({
        isDirectory: () => false,
        isFile: () => true,
      });

      statSyncMock.mockReturnValueOnce({
        isDirectory: () => false,
        isFile: () => true,
      });

      const result = collectImagesFromDirectory('/test/dir');

      expect(result).toContain('/test/dir/subdir/photo2.png');
      expect(result).toContain('/test/dir/photo1.jpg');
    });

    it('should skip non-image files in subdirectories', () => {
      existsSyncMock.mockReturnValue(true);

      statSyncMock.mockReturnValueOnce({
        isDirectory: () => true,
        isFile: () => false,
      });
      readdirSyncMock.mockReturnValueOnce(['images']);

      statSyncMock.mockReturnValueOnce({
        isDirectory: () => true,
        isFile: () => false,
      });

      statSyncMock.mockReturnValueOnce({
        isDirectory: () => true,
        isFile: () => false,
      });
      readdirSyncMock.mockReturnValueOnce(['photo.jpg', 'readme.txt']);

      statSyncMock.mockReturnValueOnce({
        isDirectory: () => false,
        isFile: () => true,
      });
      statSyncMock.mockReturnValueOnce({
        isDirectory: () => false,
        isFile: () => true,
      });

      const result = collectImagesFromDirectory('/test/dir');

      expect(result).toEqual(['/test/dir/images/photo.jpg']);
    });

    it('should handle empty directory', () => {
      existsSyncMock.mockReturnValue(true);
      statSyncMock.mockReturnValue({
        isDirectory: () => true,
        isFile: () => false,
      });
      readdirSyncMock.mockReturnValue([]);

      const result = collectImagesFromDirectory('/test/empty');

      expect(result).toEqual([]);
    });
  });

  describe('uploadImages', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      s3ClientSendMock.mockResolvedValue({});
      cloudFrontSendMock.mockResolvedValue({});
    });

    it('should upload single image successfully', async () => {
      existsSyncMock.mockReturnValue(true);
      statSyncMock.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
      });
      mimeGetTypeMock.mockReturnValue('image/jpeg');
      vi.spyOn(process, 'cwd').mockReturnValue('/test');

      const result = await uploadImages('test-bucket', ['photo.jpg']);

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.uploadedKeys).toEqual(['media/photo.jpg']);
      expect(putObjectCommandMock).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'media/photo.jpg',
        Body: {},
        ContentType: 'image/jpeg',
      });
    });

    it('should upload multiple images', async () => {
      existsSyncMock.mockReturnValue(true);
      statSyncMock.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 2048,
      });
      vi.spyOn(process, 'cwd').mockReturnValue('/test');

      const result = await uploadImages('test-bucket', ['photo1.jpg', 'photo2.png']);

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.uploadedKeys).toEqual(['media/photo1.jpg', 'media/photo2.png']);
    });

    it('should skip non-image files', async () => {
      existsSyncMock.mockReturnValue(true);
      statSyncMock.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
      });
      vi.spyOn(process, 'cwd').mockReturnValue('/test');

      const result = await uploadImages('test-bucket', ['document.pdf', 'photo.jpg']);

      expect(result.successful).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('should handle file not found', async () => {
      existsSyncMock.mockReturnValue(false);
      vi.spyOn(process, 'cwd').mockReturnValue('/test');

      const result = await uploadImages('test-bucket', ['missing.jpg']);

      expect(result.successful).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('File not found');
    });

    it('should handle upload errors', async () => {
      existsSyncMock.mockReturnValue(true);
      statSyncMock.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
      });
      s3ClientSendMock.mockRejectedValue(new Error('S3 Error'));
      vi.spyOn(process, 'cwd').mockReturnValue('/test');

      const result = await uploadImages('test-bucket', ['photo.jpg']);

      expect(result.successful).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('S3 Error');
    });

    it('should apply prefix to S3 keys', async () => {
      existsSyncMock.mockReturnValue(true);
      statSyncMock.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
      });
      vi.spyOn(process, 'cwd').mockReturnValue('/test');

      const result = await uploadImages('test-bucket', ['photo.jpg'], { prefix: 'uploads' });

      expect(result.successful).toBe(1);
      expect(result.uploadedKeys).toEqual(['uploads/photo.jpg']);
      expect(putObjectCommandMock).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'uploads/photo.jpg',
        Body: {},
        ContentType: 'image/jpeg',
      });
    });

    it('should not invalidate cache when invalidateCache is false', async () => {
      existsSyncMock.mockReturnValue(true);
      statSyncMock.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
      });
      vi.spyOn(process, 'cwd').mockReturnValue('/test');
      process.env.CLOUDFRONT_DISTRIBUTION_ID = 'test-dist-id';

      await uploadImages('test-bucket', ['photo.jpg'], { invalidateCache: false });

      expect(cloudFrontSendMock).not.toHaveBeenCalled();

      delete process.env.CLOUDFRONT_DISTRIBUTION_ID;
    });

    it('should invalidate cache when invalidateCache is true and distribution ID is set', async () => {
      existsSyncMock.mockReturnValue(true);
      statSyncMock.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
      });
      vi.spyOn(process, 'cwd').mockReturnValue('/test');
      process.env.CLOUDFRONT_DISTRIBUTION_ID = 'test-dist-id';

      await uploadImages('test-bucket', ['photo.jpg'], { invalidateCache: true });

      expect(createInvalidationCommandMock).toHaveBeenCalled();
      expect(cloudFrontSendMock).toHaveBeenCalled();

      delete process.env.CLOUDFRONT_DISTRIBUTION_ID;
    });

    it('should not invalidate cache when no files are uploaded', async () => {
      existsSyncMock.mockReturnValue(true);
      statSyncMock.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
      });
      vi.spyOn(process, 'cwd').mockReturnValue('/test');
      process.env.CLOUDFRONT_DISTRIBUTION_ID = 'test-dist-id';

      await uploadImages('test-bucket', ['document.pdf'], { invalidateCache: true });

      expect(cloudFrontSendMock).not.toHaveBeenCalled();

      delete process.env.CLOUDFRONT_DISTRIBUTION_ID;
    });

    it('should handle CloudFront invalidation errors gracefully', async () => {
      existsSyncMock.mockReturnValue(true);
      statSyncMock.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
      });
      cloudFrontSendMock.mockRejectedValue(new Error('CloudFront Error'));
      vi.spyOn(process, 'cwd').mockReturnValue('/test');
      process.env.CLOUDFRONT_DISTRIBUTION_ID = 'test-dist-id';

      const result = await uploadImages('test-bucket', ['photo.jpg'], { invalidateCache: true });

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);

      delete process.env.CLOUDFRONT_DISTRIBUTION_ID;
    });

    it('should use wildcard invalidation for large batches (>3000 files)', async () => {
      existsSyncMock.mockReturnValue(true);
      statSyncMock.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
      });
      vi.spyOn(process, 'cwd').mockReturnValue('/test');
      process.env.CLOUDFRONT_DISTRIBUTION_ID = 'test-dist-id';

      // Create array of 3001 file paths
      const filePaths = Array.from({ length: 3001 }, (_, i) => `photo${i}.jpg`);

      await uploadImages('test-bucket', filePaths, { invalidateCache: true });

      // Should use wildcard invalidation (/*) instead of individual paths
      expect(createInvalidationCommandMock).toHaveBeenCalledWith({
        DistributionId: 'test-dist-id',
        InvalidationBatch: {
          CallerReference: expect.stringContaining('upload-images-wildcard-'),
          Paths: {
            Quantity: 1,
            Items: ['/*'],
          },
        },
      });
      expect(cloudFrontSendMock).toHaveBeenCalledTimes(1);

      delete process.env.CLOUDFRONT_DISTRIBUTION_ID;
    });

    it('should invalidate specific paths for uploads ≤ 3000 files', async () => {
      existsSyncMock.mockReturnValue(true);
      statSyncMock.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
      });
      vi.spyOn(process, 'cwd').mockReturnValue('/test');
      process.env.CLOUDFRONT_DISTRIBUTION_ID = 'test-dist-id';

      // Create array of 100 file paths (well under the 3000 limit)
      const filePaths = Array.from({ length: 100 }, (_, i) => `photo${i}.jpg`);

      await uploadImages('test-bucket', filePaths, { invalidateCache: true });

      // Should use specific path invalidation, not wildcard
      // generateS3Key prepends default 'media/' prefix, and invalidation prepends '/'
      expect(createInvalidationCommandMock).toHaveBeenCalledWith({
        DistributionId: 'test-dist-id',
        InvalidationBatch: {
          CallerReference: expect.stringContaining('upload-images-'),
          Paths: {
            Quantity: 100,
            Items: expect.arrayContaining(['/media/photo0.jpg', '/media/photo1.jpg']),
          },
        },
      });
      expect(cloudFrontSendMock).toHaveBeenCalledTimes(1);

      delete process.env.CLOUDFRONT_DISTRIBUTION_ID;
    });

    it('should skip directories when uploading', async () => {
      existsSyncMock.mockReturnValue(true);
      statSyncMock.mockReturnValue({
        isFile: () => false,
        isDirectory: () => true,
        size: 0,
      });
      vi.spyOn(process, 'cwd').mockReturnValue('/test');

      const result = await uploadImages('test-bucket', ['some-directory']);

      expect(result.successful).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it('should use custom AWS region', async () => {
      existsSyncMock.mockReturnValue(true);
      statSyncMock.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
      });
      vi.spyOn(process, 'cwd').mockReturnValue('/test');

      const result = await uploadImages('test-bucket', ['photo.jpg'], {}, 'eu-west-1');

      expect(result.successful).toBe(1);
    });
  });

  describe('parseArgs', () => {
    it('should parse single file path', () => {
      const result = parseArgs(['photo.jpg']);

      expect(result.mode).toBe('files');
      expect(result.paths).toEqual(['photo.jpg']);
      expect(result.prefix).toBeUndefined();
      expect(result.invalidateCache).toBe(true);
    });

    it('should parse comma-separated file paths', () => {
      const result = parseArgs(['photo1.jpg,photo2.png,photo3.webp']);

      expect(result.mode).toBe('files');
      expect(result.paths).toEqual(['photo1.jpg', 'photo2.png', 'photo3.webp']);
    });

    it('should parse comma-separated paths with spaces', () => {
      const result = parseArgs(['photo1.jpg, photo2.png , photo3.webp']);

      expect(result.mode).toBe('files');
      expect(result.paths).toEqual(['photo1.jpg', 'photo2.png', 'photo3.webp']);
    });

    it('should parse directory mode with --dir flag', () => {
      const result = parseArgs(['--dir', '/path/to/images']);

      expect(result.mode).toBe('directory');
      expect(result.paths).toEqual(['/path/to/images']);
    });

    it('should parse directory mode with -d flag', () => {
      const result = parseArgs(['-d', './images']);

      expect(result.mode).toBe('directory');
      expect(result.paths).toEqual(['./images']);
    });

    it('should parse prefix with --prefix flag', () => {
      const result = parseArgs(['photo.jpg', '--prefix', 'uploads']);

      expect(result.prefix).toBe('uploads');
      expect(result.paths).toEqual(['photo.jpg']);
    });

    it('should parse prefix with -p flag', () => {
      const result = parseArgs(['photo.jpg', '-p', 'user-content']);

      expect(result.prefix).toBe('user-content');
      expect(result.paths).toEqual(['photo.jpg']);
    });

    it('should parse --no-invalidate flag', () => {
      const result = parseArgs(['photo.jpg', '--no-invalidate']);

      expect(result.invalidateCache).toBe(false);
    });

    it('should parse complex arguments', () => {
      const result = parseArgs(['--dir', './images', '--prefix', 'gallery/', '--no-invalidate']);

      expect(result.mode).toBe('directory');
      expect(result.paths).toEqual(['./images']);
      expect(result.prefix).toBe('gallery/');
      expect(result.invalidateCache).toBe(false);
    });

    it('should handle prefix without value', () => {
      const result = parseArgs(['photo.jpg', '--prefix']);

      expect(result.paths).toEqual(['photo.jpg']);
      expect(result.prefix).toBeUndefined();
    });

    it('should handle directory without path', () => {
      const result = parseArgs(['--dir']);

      expect(result.mode).toBe('directory');
      expect(result.paths).toEqual([]);
    });

    it('should handle multiple file paths as separate arguments', () => {
      const result = parseArgs(['photo1.jpg', 'photo2.png']);

      expect(result.mode).toBe('files');
      expect(result.paths).toEqual(['photo1.jpg', 'photo2.png']);
    });

    it('should skip option-like values after flags', () => {
      const result = parseArgs(['--dir', '--prefix', 'uploads']);

      expect(result.mode).toBe('directory');
      expect(result.paths).toEqual([]);
      expect(result.prefix).toBe('uploads');
    });

    it('should handle empty arguments', () => {
      const result = parseArgs([]);

      expect(result.mode).toBe('files');
      expect(result.paths).toEqual([]);
      expect(result.prefix).toBeUndefined();
      expect(result.invalidateCache).toBe(true);
    });

    it('should combine comma-separated and individual paths', () => {
      const result = parseArgs(['photo1.jpg,photo2.png', 'photo3.webp']);

      expect(result.paths).toEqual(['photo1.jpg', 'photo2.png', 'photo3.webp']);
    });

    it('should handle prefix with trailing slash', () => {
      const result = parseArgs(['--prefix', 'uploads/', 'photo.jpg']);

      expect(result.prefix).toBe('uploads/');
      expect(result.paths).toEqual(['photo.jpg']);
    });

    it('should parse all argument types together', () => {
      const result = parseArgs([
        'photo1.jpg,photo2.png',
        '--prefix',
        'gallery/2026/',
        'photo3.webp',
        '--no-invalidate',
      ]);

      expect(result.mode).toBe('files');
      expect(result.paths).toEqual(['photo1.jpg', 'photo2.png', 'photo3.webp']);
      expect(result.prefix).toBe('gallery/2026/');
      expect(result.invalidateCache).toBe(false);
    });
  });
});
