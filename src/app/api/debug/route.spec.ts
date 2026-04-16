// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GET } from './route';

const mockAuth = vi.fn();

vi.mock('../../../../auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

describe('GET /api/debug', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      S3_BUCKET: 'test-bucket',
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'test-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret',
      CDN_DOMAIN: 'https://cdn.example.com',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return 200 with environment variable presence for admin users', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasS3Bucket).toBe(true);
    expect(data.hasAwsRegion).toBe(true);
    expect(data.hasAwsAccessKey).toBe(true);
    expect(data.hasAwsSecretKey).toBe(true);
    expect(data.hasCdnDomain).toBe(true);
  });

  it('should return 401 when session is null', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('should return 401 when session has no user', async () => {
    mockAuth.mockResolvedValue({ user: undefined });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Authentication required');
  });

  it('should return 403 for non-admin users', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-1', email: 'user@test.com', role: 'user' },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Admin access required');
  });

  it('should return boolean values for all environment variable checks', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' },
    });

    const response = await GET();
    const data = await response.json();

    expect(typeof data.hasS3Bucket).toBe('boolean');
    expect(typeof data.hasAwsRegion).toBe('boolean');
    expect(typeof data.hasAwsAccessKey).toBe('boolean');
    expect(typeof data.hasAwsSecretKey).toBe('boolean');
    expect(typeof data.hasCdnDomain).toBe('boolean');
  });

  it('should return false for missing environment variables', async () => {
    delete process.env.S3_BUCKET;
    delete process.env.AWS_REGION;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.CDN_DOMAIN;

    mockAuth.mockResolvedValue({
      user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.hasS3Bucket).toBe(false);
    expect(data.hasAwsRegion).toBe(false);
    expect(data.hasAwsAccessKey).toBe(false);
    expect(data.hasAwsSecretKey).toBe(false);
    expect(data.hasCdnDomain).toBe(false);
  });
});
