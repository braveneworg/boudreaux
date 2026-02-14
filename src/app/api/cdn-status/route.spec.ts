import { GET } from './route';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: vi.fn().mockImplementation(function () {
    return { send: mockSend };
  }),
  ListInvalidationsCommand: vi.fn(),
}));

describe('CDN Status API', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      CLOUDFRONT_DISTRIBUTION_ID: 'test-distribution-id',
      AWS_ACCESS_KEY_ID: 'test-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('GET /api/cdn-status', () => {
    it('should return unknown status when CDN is not configured', async () => {
      delete process.env.CLOUDFRONT_DISTRIBUTION_ID;

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('unknown');
      expect(data.message).toBe('CDN not configured');
    });

    it('should return ready status when no invalidations exist', async () => {
      mockSend.mockResolvedValue({
        InvalidationList: { Items: [] },
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ready');
      expect(data.message).toBe('CDN is ready');
    });

    it('should return ready status when InvalidationList is undefined', async () => {
      mockSend.mockResolvedValue({});

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ready');
      expect(data.message).toBe('CDN is ready');
    });

    it('should return invalidating status when invalidations are in progress', async () => {
      const createTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      mockSend.mockResolvedValue({
        InvalidationList: {
          Items: [{ Id: 'inv-1', Status: 'InProgress', CreateTime: createTime }],
        },
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('invalidating');
      expect(data.message).toBe('CDN cache is being updated');
      expect(data.inProgress).toBe(1);
      expect(data.estimatedMinutesRemaining).toBe(10);
      expect(data.startedAt).toBe(createTime.toISOString());
    });

    it('should return 0 estimated minutes remaining when invalidation exceeds 15 minutes', async () => {
      const createTime = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
      mockSend.mockResolvedValue({
        InvalidationList: {
          Items: [{ Id: 'inv-1', Status: 'InProgress', CreateTime: createTime }],
        },
      });

      const response = await GET();
      const data = await response.json();

      expect(data.status).toBe('invalidating');
      expect(data.estimatedMinutesRemaining).toBe(0);
    });

    it('should handle in-progress invalidation without CreateTime', async () => {
      mockSend.mockResolvedValue({
        InvalidationList: {
          Items: [{ Id: 'inv-1', Status: 'InProgress', CreateTime: undefined }],
        },
      });

      const response = await GET();
      const data = await response.json();

      expect(data.status).toBe('invalidating');
      expect(data.estimatedMinutesRemaining).toBe(15);
      expect(data.startedAt).toBeUndefined();
    });

    it('should count multiple in-progress invalidations', async () => {
      mockSend.mockResolvedValue({
        InvalidationList: {
          Items: [
            { Id: 'inv-1', Status: 'InProgress', CreateTime: new Date() },
            { Id: 'inv-2', Status: 'InProgress', CreateTime: new Date() },
            { Id: 'inv-3', Status: 'Completed', CreateTime: new Date(Date.now() - 60 * 60 * 1000) },
          ],
        },
      });

      const response = await GET();
      const data = await response.json();

      expect(data.status).toBe('invalidating');
      expect(data.inProgress).toBe(2);
    });

    it('should return ready with recently completed message when invalidation finished within 5 minutes', async () => {
      const completedTime = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago
      mockSend.mockResolvedValue({
        InvalidationList: {
          Items: [{ Id: 'inv-1', Status: 'Completed', CreateTime: completedTime }],
        },
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ready');
      expect(data.message).toBe(
        'CDN cache recently updated - you may need to refresh your browser'
      );
      expect(data.completedAt).toBe(completedTime.toISOString());
    });

    it('should return plain ready status when completions are older than 5 minutes', async () => {
      const oldCompletedTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      mockSend.mockResolvedValue({
        InvalidationList: {
          Items: [{ Id: 'inv-1', Status: 'Completed', CreateTime: oldCompletedTime }],
        },
      });

      const response = await GET();
      const data = await response.json();

      expect(data.status).toBe('ready');
      expect(data.message).toBe('CDN is ready');
      expect(data.completedAt).toBeUndefined();
    });

    it('should skip completed invalidations without CreateTime', async () => {
      mockSend.mockResolvedValue({
        InvalidationList: {
          Items: [{ Id: 'inv-1', Status: 'Completed', CreateTime: undefined }],
        },
      });

      const response = await GET();
      const data = await response.json();

      expect(data.status).toBe('ready');
      expect(data.message).toBe('CDN is ready');
    });

    it('should prioritize in-progress over recently completed invalidations', async () => {
      mockSend.mockResolvedValue({
        InvalidationList: {
          Items: [
            { Id: 'inv-1', Status: 'InProgress', CreateTime: new Date() },
            { Id: 'inv-2', Status: 'Completed', CreateTime: new Date(Date.now() - 1 * 60 * 1000) },
          ],
        },
      });

      const response = await GET();
      const data = await response.json();

      expect(data.status).toBe('invalidating');
    });

    it('should return error status when CloudFront API throws', async () => {
      mockSend.mockRejectedValue(new Error('Access denied'));

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.status).toBe('error');
      expect(data.message).toBe('Unable to check CDN status');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error checking CDN status:', expect.any(Error));

      consoleErrorSpy.mockRestore();
    });

    it('should use empty strings for missing AWS credentials', async () => {
      const { CloudFrontClient: MockedClient } = await import('@aws-sdk/client-cloudfront');

      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;

      mockSend.mockResolvedValue({ InvalidationList: { Items: [] } });

      await GET();

      expect(MockedClient).toHaveBeenCalledWith({
        region: 'us-east-1',
        credentials: {
          accessKeyId: '',
          secretAccessKey: '',
        },
      });
    });
  });
});
