import * as mm from 'music-metadata';

import { AudioMetadataService, type AudioMetadata } from './audio-metadata-service';

// Mock server-only to allow testing server components
vi.mock('server-only', () => ({}));

// Mock music-metadata
vi.mock('music-metadata', () => ({
  parseBuffer: vi.fn(),
  parseStream: vi.fn(),
}));

const mockParseBuffer = vi.mocked(mm.parseBuffer);
const mockParseStream = vi.mocked(mm.parseStream);

describe('AudioMetadataService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractMetadata', () => {
    it('should extract basic metadata from an audio buffer', async () => {
      const mockMetadata = {
        format: {
          duration: 225.5,
          bitrate: 320000,
          sampleRate: 44100,
          numberOfChannels: 2,
          codec: 'MP3',
          container: 'MPEG',
          lossless: false,
        },
        common: {
          title: 'Test Track',
          artist: 'Test Artist',
          album: 'Test Album',
          albumartist: 'Album Artist',
          year: 2024,
          date: '2024-03-15',
          genre: ['Rock', 'Alternative'],
          track: { no: 5, of: 12 },
          label: ['Test Records'],
          catalognumber: ['TEST-001'],
        },
      };

      mockParseBuffer.mockResolvedValue(mockMetadata as Awaited<ReturnType<typeof mm.parseBuffer>>);

      const buffer = Buffer.from('test audio data');
      const result = await AudioMetadataService.extractMetadata(buffer, 'audio/mpeg');

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data).toEqual({
        title: 'Test Track',
        artist: 'Test Artist',
        album: 'Test Album',
        albumArtist: 'Album Artist',
        duration: 226, // Rounded from 225.5
        trackNumber: 5,
        trackTotal: 12,
        year: 2024,
        date: '2024-03-15',
        genre: ['Rock', 'Alternative'],
        label: 'Test Records',
        catalogNumber: 'TEST-001',
        bitrate: 320, // Converted from 320000 to kbps
        sampleRate: 44100,
        channels: 2,
        codec: 'MP3',
        container: 'MPEG',
        lossless: false,
        coverArt: undefined,
        coverArtMimeType: undefined,
      } satisfies AudioMetadata);
    });

    it('should extract cover art as base64 data URL', async () => {
      const mockPictureData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header bytes
      const mockMetadata = {
        format: { duration: 180 },
        common: {
          title: 'Track with Cover',
          picture: [
            {
              format: 'image/jpeg',
              data: mockPictureData,
            },
          ],
        },
      };

      mockParseBuffer.mockResolvedValue(mockMetadata as Awaited<ReturnType<typeof mm.parseBuffer>>);

      const buffer = Buffer.from('test audio data');
      const result = await AudioMetadataService.extractMetadata(buffer, 'audio/mpeg');

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.coverArt).toMatch(/^data:image\/jpeg;base64,/);
      expect(result.data.coverArtMimeType).toBe('image/jpeg');
    });

    it('should handle missing optional metadata fields', async () => {
      const mockMetadata = {
        format: {},
        common: {},
      };

      mockParseBuffer.mockResolvedValue(mockMetadata as Awaited<ReturnType<typeof mm.parseBuffer>>);

      const buffer = Buffer.from('test audio data');
      const result = await AudioMetadataService.extractMetadata(buffer, 'audio/mpeg');

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data).toEqual({
        title: undefined,
        artist: undefined,
        album: undefined,
        albumArtist: undefined,
        duration: undefined,
        trackNumber: undefined,
        trackTotal: undefined,
        year: undefined,
        date: undefined,
        genre: undefined,
        label: undefined,
        catalogNumber: undefined,
        bitrate: undefined,
        sampleRate: undefined,
        channels: undefined,
        codec: undefined,
        container: undefined,
        lossless: undefined,
        coverArt: undefined,
        coverArtMimeType: undefined,
      } satisfies AudioMetadata);
    });

    it('should join multiple artists', async () => {
      const mockMetadata = {
        format: { duration: 200 },
        common: {
          artists: ['Artist 1', 'Artist 2', 'Artist 3'],
        },
      };

      mockParseBuffer.mockResolvedValue(mockMetadata as Awaited<ReturnType<typeof mm.parseBuffer>>);

      const buffer = Buffer.from('test audio data');
      const result = await AudioMetadataService.extractMetadata(buffer, 'audio/mpeg');

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.artist).toBe('Artist 1, Artist 2, Artist 3');
    });

    it('should prefer single artist over artists array', async () => {
      const mockMetadata = {
        format: { duration: 200 },
        common: {
          artist: 'Main Artist',
          artists: ['Artist 1', 'Artist 2'],
        },
      };

      mockParseBuffer.mockResolvedValue(mockMetadata as Awaited<ReturnType<typeof mm.parseBuffer>>);

      const buffer = Buffer.from('test audio data');
      const result = await AudioMetadataService.extractMetadata(buffer, 'audio/mpeg');

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.artist).toBe('Main Artist');
    });

    it('should return error for unsupported MIME type', async () => {
      mockParseBuffer.mockRejectedValue(new Error('MIME-type not supported'));

      const buffer = Buffer.from('test data');
      const result = await AudioMetadataService.extractMetadata(buffer, 'application/octet-stream');

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toBe('Unsupported audio format. Please upload a valid audio file.');
    });

    it('should return error for corrupted audio file', async () => {
      mockParseBuffer.mockRejectedValue(new Error('End-Of-Stream'));

      const buffer = Buffer.from('corrupted data');
      const result = await AudioMetadataService.extractMetadata(buffer, 'audio/mpeg');

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toBe('Invalid or corrupted audio file.');
    });

    it('should return error for generic parsing failures', async () => {
      mockParseBuffer.mockRejectedValue(new Error('Unknown parsing error'));

      const buffer = Buffer.from('test data');
      const result = await AudioMetadataService.extractMetadata(buffer, 'audio/mpeg');

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toBe('Failed to extract metadata: Unknown parsing error');
    });

    it('should handle non-Error exceptions', async () => {
      mockParseBuffer.mockRejectedValue('String error');

      const buffer = Buffer.from('test data');
      const result = await AudioMetadataService.extractMetadata(buffer, 'audio/mpeg');

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toBe('Failed to extract audio metadata');
    });
  });

  describe('extractMetadataFromStream', () => {
    it('should extract metadata from a stream', async () => {
      const mockMetadata = {
        format: {
          duration: 300,
          bitrate: 256000,
          sampleRate: 48000,
          numberOfChannels: 2,
          codec: 'FLAC',
          container: 'FLAC',
          lossless: true,
        },
        common: {
          title: 'Stream Track',
          artist: 'Stream Artist',
          album: 'Stream Album',
          year: 2023,
          genre: ['Jazz'],
          track: { no: 1, of: 8 },
        },
      };

      mockParseStream.mockResolvedValue(mockMetadata as Awaited<ReturnType<typeof mm.parseStream>>);

      // Create a mock readable stream
      const { Readable } = await import('node:stream');
      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });

      const result = await AudioMetadataService.extractMetadataFromStream(
        mockStream,
        'audio/flac',
        1024 * 1024
      );

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.title).toBe('Stream Track');
      expect(result.data.lossless).toBe(true);
    });

    it('should extract cover art from stream as base64 data URL', async () => {
      const mockPictureData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header bytes
      const mockMetadata = {
        format: { duration: 180 },
        common: {
          title: 'Stream Track with Cover',
          picture: [
            {
              format: 'image/png',
              data: mockPictureData,
            },
          ],
        },
      };

      mockParseStream.mockResolvedValue(mockMetadata as Awaited<ReturnType<typeof mm.parseStream>>);

      const { Readable } = await import('node:stream');
      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });

      const result = await AudioMetadataService.extractMetadataFromStream(
        mockStream,
        'audio/flac',
        1024 * 1024
      );

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Expected success');
      expect(result.data.coverArt).toMatch(/^data:image\/png;base64,/);
      expect(result.data.coverArtMimeType).toBe('image/png');
    });

    it('should return error when stream parsing fails', async () => {
      mockParseStream.mockRejectedValue(new Error('Stream read error'));

      const { Readable } = await import('node:stream');
      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });

      const result = await AudioMetadataService.extractMetadataFromStream(
        mockStream,
        'audio/mpeg',
        1024
      );

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toBe('Failed to extract metadata: Stream read error');
    });

    it('should handle non-Error exceptions in stream parsing', async () => {
      mockParseStream.mockRejectedValue('Non-error rejection');

      const { Readable } = await import('node:stream');
      const mockStream = new Readable({
        read() {
          this.push(null);
        },
      });

      const result = await AudioMetadataService.extractMetadataFromStream(
        mockStream,
        'audio/mpeg',
        1024
      );

      expect(result.success).toBe(false);
      if (result.success) throw new Error('Expected failure');
      expect(result.error).toBe('Failed to extract audio metadata from stream');
    });
  });
});
