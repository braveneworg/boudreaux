import type { NextRequest, NextResponse } from 'next/server';

import { AudioMetadataService } from '@/lib/services/audio-metadata-service';

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock next/server
vi.mock('next/server', async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return {
    ...actual,
  };
});

// Mock the auth decorator to pass through the handler
vi.mock('@/lib/decorators/with-auth', () => ({
  withAdmin: vi.fn((handler) => Promise.resolve(handler)),
}));

// Mock the AudioMetadataService
vi.mock('@/lib/services/audio-metadata-service', () => ({
  AudioMetadataService: {
    extractMetadata: vi.fn(),
  },
}));

const mockExtractMetadata = vi.mocked(AudioMetadataService.extractMetadata);

function createMockRequest(contentType: string, formData?: FormData): NextRequest {
  const headers = new Headers();
  headers.set('content-type', contentType);

  return {
    headers,
    formData: vi.fn().mockResolvedValue(formData || new FormData()),
  } as unknown as NextRequest;
}

function createMockFile(name: string, type: string, content = 'mock audio data'): File {
  const blob = new Blob([content], { type });
  const file = new File([blob], name, { type });

  // Ensure arrayBuffer method works properly in test environment
  if (!file.arrayBuffer) {
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => {
        const reader = new FileReader();
        return new Promise<ArrayBuffer>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = reject;
          reader.readAsArrayBuffer(blob);
        });
      },
    });
  }

  return file;
}

describe('POST /api/tracks/metadata', () => {
  let POST: (request: NextRequest) => Promise<NextResponse>;

  beforeAll(async () => {
    // Dynamically import the route after mocks are set up
    const route = await import('./route');
    // The withAdmin mock passes through the handler directly, which only takes request
    POST = route.POST as unknown as (request: NextRequest) => Promise<NextResponse>;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 400 if content type header is missing', async () => {
    const request = {
      headers: new Headers(), // No content-type header
      formData: vi.fn().mockResolvedValue(new FormData()),
    } as unknown as NextRequest;

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Content-Type must be multipart/form-data');
  });

  it('should return 400 if content type is not multipart/form-data', async () => {
    const request = createMockRequest('application/json');

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Content-Type must be multipart/form-data');
  });

  it('should return 400 if no file is provided', async () => {
    const formData = new FormData();
    const request = createMockRequest('multipart/form-data; boundary=---', formData);

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('No file provided');
  });

  it('should return 400 for unsupported file types', async () => {
    const formData = new FormData();
    const file = createMockFile('test.txt', 'text/plain');
    formData.append('file', file);

    const request = createMockRequest('multipart/form-data; boundary=---', formData);

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('Unsupported file type');
  });

  it('should extract metadata from valid audio file', async () => {
    const mockMetadata = {
      title: 'Test Song',
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 180,
      trackNumber: 1,
    };

    mockExtractMetadata.mockResolvedValue({
      success: true,
      data: mockMetadata,
    });

    const formData = new FormData();
    const file = createMockFile('test.mp3', 'audio/mpeg');
    formData.append('file', file);

    const request = createMockRequest('multipart/form-data; boundary=---', formData);

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.metadata).toEqual(mockMetadata);
    expect(mockExtractMetadata).toHaveBeenCalledWith(expect.any(Buffer), 'audio/mpeg', 'test.mp3');
  });

  it('should accept various audio formats', async () => {
    mockExtractMetadata.mockResolvedValue({
      success: true,
      data: { title: 'Test' },
    });

    const audioTypes = [
      { type: 'audio/wav', ext: 'wav' },
      { type: 'audio/flac', ext: 'flac' },
      { type: 'audio/aac', ext: 'aac' },
      { type: 'audio/ogg', ext: 'ogg' },
      { type: 'audio/m4a', ext: 'm4a' },
      { type: 'audio/webm', ext: 'webm' },
      { type: 'video/mp4', ext: 'mp4' },
    ];

    for (const { type, ext } of audioTypes) {
      const formData = new FormData();
      const file = createMockFile(`test.${ext}`, type);
      formData.append('file', file);

      const request = createMockRequest('multipart/form-data; boundary=---', formData);

      const response = await POST(request);
      expect(response.status).toBe(200);
    }
  });

  it('should return 400 when metadata extraction fails', async () => {
    mockExtractMetadata.mockResolvedValue({
      success: false,
      error: 'Invalid or corrupted audio file.',
    });

    const formData = new FormData();
    const file = createMockFile('corrupted.mp3', 'audio/mpeg');
    formData.append('file', file);

    const request = createMockRequest('multipart/form-data; boundary=---', formData);

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid or corrupted audio file.');
  });

  it('should return 500 for unexpected errors', async () => {
    mockExtractMetadata.mockRejectedValue(new Error('Unexpected error'));

    const formData = new FormData();
    const file = createMockFile('test.mp3', 'audio/mpeg');
    formData.append('file', file);

    const request = createMockRequest('multipart/form-data; boundary=---', formData);

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Internal server error');
  });
});
