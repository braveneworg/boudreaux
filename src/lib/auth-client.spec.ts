/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const mockCreateAuthClient = vi.hoisted(() => vi.fn(() => ({})));
const mockGetApiBaseUrl = vi.hoisted(() => vi.fn(() => 'https://www.fakefourrecords.com'));

vi.mock('better-auth/react', () => ({ createAuthClient: mockCreateAuthClient }));
vi.mock('better-auth/client/plugins', () => ({
  adminClient: vi.fn(() => ({})),
  inferAdditionalFields: vi.fn(() => ({})),
  magicLinkClient: vi.fn(() => ({})),
}));
vi.mock('@/lib/utils/api-base-url', () => ({ getApiBaseUrl: mockGetApiBaseUrl }));

describe('authClient', () => {
  it('targets the served origin so the auth API stays same-origin', async () => {
    vi.resetModules();
    mockGetApiBaseUrl.mockReturnValue('https://www.fakefourrecords.com');

    await import('./auth-client');

    const calls = (mockCreateAuthClient as ReturnType<typeof vi.fn>).mock.calls;
    const config = calls[calls.length - 1][0];
    // Same-origin keeps the request under CSP `connect-src 'self'` and the
    // host-only session cookie first-party, regardless of which host served
    // the page (apex, www, or a preview).
    expect(config.baseURL).toBe('https://www.fakefourrecords.com');
  });
});
