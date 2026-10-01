/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NextRequest } from 'next/server';

import { guestIdentityService } from '@/lib/services/guest-identity-service';
import { readGuestVisitorId, setGuestVisitorIdCookie } from '@/lib/utils/guest-visitor-id';

import { resolveDownloadSubject } from './resolve-download-subject';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/guest-identity-service', () => ({
  guestIdentityService: { resolveVisitorIdentity: vi.fn() },
}));
vi.mock('@/lib/utils/guest-visitor-id', () => ({
  readGuestVisitorId: vi.fn(),
  setGuestVisitorIdCookie: vi.fn(),
}));
vi.mock('@/lib/decorators/with-rate-limit', () => ({
  extractClientIp: () => '203.0.113.9',
}));

const request = new NextRequest('http://localhost/api/releases/r1/download/bundle', {
  headers: { 'user-agent': 'spec-agent', 'accept-language': 'en-US' },
});

describe('resolveDownloadSubject', () => {
  it('returns a user subject for a signed-in user without touching guest identity', async () => {
    const subject = await resolveDownloadSubject(request, 'user-1');

    expect(subject).toEqual({ kind: 'user', userId: 'user-1' });
    expect(guestIdentityService.resolveVisitorIdentity).not.toHaveBeenCalled();
  });

  it('resolves a guest from cookie + fingerprint and carries the visitor-id union', async () => {
    vi.mocked(readGuestVisitorId).mockResolvedValueOnce('cookie-a');
    vi.mocked(guestIdentityService.resolveVisitorIdentity).mockResolvedValueOnce({
      primaryVisitorId: 'cookie-a',
      allVisitorIds: ['cookie-a', 'fp-b'],
      cookieReissue: false,
    });

    const subject = await resolveDownloadSubject(request, null);

    expect(subject).toEqual({
      kind: 'guest',
      visitorId: 'cookie-a',
      visitorIds: ['cookie-a', 'fp-b'],
    });
    expect(vi.mocked(guestIdentityService.resolveVisitorIdentity).mock.calls).toEqual([
      [{ cookieValue: 'cookie-a', fingerprintHash: expect.any(String) }],
    ]);
    expect(setGuestVisitorIdCookie).not.toHaveBeenCalled();
  });

  it('reissues the cookie when identity resolution asks for it', async () => {
    vi.mocked(readGuestVisitorId).mockResolvedValueOnce(null);
    vi.mocked(guestIdentityService.resolveVisitorIdentity).mockResolvedValueOnce({
      primaryVisitorId: 'minted',
      allVisitorIds: ['minted'],
      cookieReissue: true,
    });

    const subject = await resolveDownloadSubject(request, null);

    expect(subject).toEqual({ kind: 'guest', visitorId: 'minted', visitorIds: ['minted'] });
    expect(vi.mocked(setGuestVisitorIdCookie).mock.calls).toEqual([['minted']]);
  });
});
