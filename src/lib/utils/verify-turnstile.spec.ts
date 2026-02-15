/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// Mock server-only to prevent client component error in tests
import { verifyTurnstile } from '@/lib/utils/verify-turnstile';

vi.mock('server-only', () => ({}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('verifyTurnstile', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CLOUDFLARE_SECRET: 'test-secret-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('successful verification', () => {
    it('should return success when Cloudflare returns success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await verifyTurnstile('valid-token', '127.0.0.1');

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );
    });

    it('should include token and secret in request body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await verifyTurnstile('my-token', '192.168.1.1');

      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body.toString();

      expect(body).toContain('secret=test-secret-key');
      expect(body).toContain('response=my-token');
      expect(body).toContain('remoteip=192.168.1.1');
    });

    it('should work without remote IP', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await verifyTurnstile('my-token');

      const fetchCall = mockFetch.mock.calls[0];
      const body = fetchCall[1].body.toString();

      expect(body).toContain('secret=test-secret-key');
      expect(body).toContain('response=my-token');
      expect(body).not.toContain('remoteip');
    });
  });

  describe('verification failures', () => {
    it('should return error when Cloudflare returns error codes', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            'error-codes': ['invalid-input-response', 'timeout-or-duplicate'],
          }),
      });

      const result = await verifyTurnstile('invalid-token', '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid verification. Please try again.');
    });

    it('should return generic error when no error codes provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false }),
      });

      const result = await verifyTurnstile('invalid-token', '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Verification failed. Please refresh and try again.');
    });

    it('should return generic error when error codes do not contain invalid-input-response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            'error-codes': ['timeout-or-duplicate'],
          }),
      });

      const result = await verifyTurnstile('invalid-token', '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Verification failed. Please refresh and try again.');
    });
  });

  describe('test secret key bypass', () => {
    it('should return success immediately when using Cloudflare test secret key', async () => {
      process.env.CLOUDFLARE_SECRET = '1x0000000000000000000000000000000AA';

      const result = await verifyTurnstile('any-token', '127.0.0.1');

      expect(result).toEqual({ success: true });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not bypass verification for non-test secret keys', async () => {
      process.env.CLOUDFLARE_SECRET = 'real-production-secret';
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await verifyTurnstile('valid-token', '127.0.0.1');

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('missing configuration', () => {
    it('should return error when CLOUDFLARE_SECRET is not set', async () => {
      delete process.env.CLOUDFLARE_SECRET;

      const result = await verifyTurnstile('valid-token', '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server configuration error');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return error when CLOUDFLARE_SECRET is empty string', async () => {
      process.env.CLOUDFLARE_SECRET = '';

      const result = await verifyTurnstile('valid-token', '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server configuration error');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return error when token is empty', async () => {
      const result = await verifyTurnstile('', '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Turnstile token is required');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('network errors', () => {
    it('should return error when fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await verifyTurnstile('valid-token', '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Verification service error');
    });

    it('should return error when response is not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await verifyTurnstile('valid-token', '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Verification service unavailable');
    });

    it('should return error when JSON parsing fails', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      const result = await verifyTurnstile('valid-token', '127.0.0.1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Verification service error');
    });
  });
});
