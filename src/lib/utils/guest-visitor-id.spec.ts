/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getOrIssueGuestVisitorId,
  readGuestVisitorId,
  setGuestVisitorIdCookie,
  VISITOR_ID_COOKIE,
} from '@/lib/utils/guest-visitor-id';

vi.mock('server-only', () => ({}));

interface FakeCookieStore {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

const cookieStore: FakeCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockImplementation(async () => cookieStore),
}));

const randomUUIDSpy = vi.fn();
vi.stubGlobal('crypto', {
  randomUUID: () => randomUUIDSpy(),
});

const VALID_UUID = '019045d8-1c4f-7c1a-9d2b-2f1a3a4b5c6d';
const ANOTHER_VALID = '11111111-2222-4333-8444-555555555555';

describe('getOrIssueGuestVisitorId', () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
    cookieStore.set.mockReset();
    randomUUIDSpy.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the existing cookie value when it is a valid UUID', async () => {
    cookieStore.get.mockReturnValue({ value: VALID_UUID });

    const result = await getOrIssueGuestVisitorId();

    expect(result).toBe(VALID_UUID);
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(randomUUIDSpy).not.toHaveBeenCalled();
  });

  it('issues a fresh UUID when no cookie is present', async () => {
    cookieStore.get.mockReturnValue(undefined);
    randomUUIDSpy.mockReturnValue(ANOTHER_VALID);

    const result = await getOrIssueGuestVisitorId();

    expect(result).toBe(ANOTHER_VALID);
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe(VISITOR_ID_COOKIE);
    expect(value).toBe(ANOTHER_VALID);
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/api',
      maxAge: 365 * 24 * 60 * 60,
    });
  });

  it('reissues when the cookie value is malformed', async () => {
    cookieStore.get.mockReturnValue({ value: 'not-a-uuid' });
    randomUUIDSpy.mockReturnValue(ANOTHER_VALID);

    const result = await getOrIssueGuestVisitorId();

    expect(result).toBe(ANOTHER_VALID);
    expect(cookieStore.set).toHaveBeenCalledTimes(1);
  });

  it('marks the cookie Secure in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    cookieStore.get.mockReturnValue(undefined);
    randomUUIDSpy.mockReturnValue(ANOTHER_VALID);

    await getOrIssueGuestVisitorId();

    expect(cookieStore.set.mock.calls[0][2]).toMatchObject({ secure: true });
  });

  it('does not mark the cookie Secure outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    cookieStore.get.mockReturnValue(undefined);
    randomUUIDSpy.mockReturnValue(ANOTHER_VALID);

    await getOrIssueGuestVisitorId();

    expect(cookieStore.set.mock.calls[0][2]).toMatchObject({ secure: false });
  });
});

describe('readGuestVisitorId', () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
    cookieStore.set.mockReset();
  });

  it('returns the cookie value when it is a valid UUID', async () => {
    cookieStore.get.mockReturnValue({ value: VALID_UUID });
    await expect(readGuestVisitorId()).resolves.toBe(VALID_UUID);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('returns null when no cookie is present', async () => {
    cookieStore.get.mockReturnValue(undefined);
    await expect(readGuestVisitorId()).resolves.toBeNull();
  });

  it('returns null when the cookie value is malformed', async () => {
    cookieStore.get.mockReturnValue({ value: 'not-a-uuid' });
    await expect(readGuestVisitorId()).resolves.toBeNull();
  });
});

describe('setGuestVisitorIdCookie', () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
    cookieStore.set.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('writes the canonical visitor id with the standard attributes', async () => {
    await setGuestVisitorIdCookie(VALID_UUID);

    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = cookieStore.set.mock.calls[0];
    expect(name).toBe(VISITOR_ID_COOKIE);
    expect(value).toBe(VALID_UUID);
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/api',
      maxAge: 365 * 24 * 60 * 60,
    });
  });

  it('marks the cookie Secure in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await setGuestVisitorIdCookie(VALID_UUID);
    expect(cookieStore.set.mock.calls[0][2]).toMatchObject({ secure: true });
  });

  it('does not mark the cookie Secure outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    await setGuestVisitorIdCookie(VALID_UUID);
    expect(cookieStore.set.mock.calls[0][2]).toMatchObject({ secure: false });
  });
});
