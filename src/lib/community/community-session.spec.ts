/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { auth } from '@/auth';

import { communityViewer, requireApprover, requireCommunityUser } from './community-session';

vi.mock('server-only', () => ({}));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

const USER_ID = 'a'.repeat(24);

const signedInAs = (role: string | null, banned: boolean | null = false): void => {
  vi.mocked(auth).mockResolvedValueOnce({ user: { id: USER_ID, role, banned } } as never);
};

const signedOut = (): void => {
  vi.mocked(auth).mockResolvedValueOnce(null);
};

describe('requireCommunityUser', () => {
  it('sends a signed-out visitor to sign in, and back to where they were going', async () => {
    signedOut();

    await expect(requireCommunityUser('/community/submit')).rejects.toThrow(
      `REDIRECT:/signin?callbackUrl=${encodeURIComponent('/community/submit')}`
    );
  });

  it.each(['admin', 'manager'])('returns a signed-in %s', async (role) => {
    signedInAs(role);

    await expect(requireCommunityUser('/community/mine')).resolves.toMatchObject({
      id: USER_ID,
      role,
    });
  });

  it('answers not found for a signed-in user the feature is not open to yet', async () => {
    signedInAs('user');

    await expect(requireCommunityUser('/community/mine')).rejects.toThrow('NOT_FOUND');
  });

  it('answers not found for a banned account, whatever its role', async () => {
    signedInAs('admin', true);

    await expect(requireCommunityUser('/community/mine')).rejects.toThrow('NOT_FOUND');
  });
});

describe('communityViewer', () => {
  it.each(['admin', 'manager'])('names a signed-in %s as the viewer', async (role) => {
    signedInAs(role);

    await expect(communityViewer()).resolves.toEqual({ id: USER_ID, role });
  });

  it('answers not found for a signed-out visitor, before launch', async () => {
    signedOut();

    await expect(communityViewer()).rejects.toThrow('NOT_FOUND');
  });

  it('answers not found for a signed-in user the feature is not open to yet', async () => {
    signedInAs('user');

    await expect(communityViewer()).rejects.toThrow('NOT_FOUND');
  });

  it('answers not found for a banned approver', async () => {
    signedInAs('manager', true);

    await expect(communityViewer()).rejects.toThrow('NOT_FOUND');
  });
});

describe('requireApprover', () => {
  it.each(['admin', 'manager'])('returns a signed-in %s for approver access', async (role) => {
    signedInAs(role);

    await expect(requireApprover('approver')).resolves.toMatchObject({ id: USER_ID, role });
  });

  it('answers not found for a manager asking for admin access', async () => {
    signedInAs('manager');

    await expect(requireApprover('admin')).rejects.toThrow('NOT_FOUND');
  });

  it('returns an admin for admin access', async () => {
    signedInAs('admin');

    await expect(requireApprover('admin')).resolves.toMatchObject({ role: 'admin' });
  });

  it.each([
    ['a plain user', 'user', false],
    ['a banned admin', 'admin', true],
  ])('answers not found for %s', async (_name, role, banned) => {
    signedInAs(role, banned);

    await expect(requireApprover('approver')).rejects.toThrow('NOT_FOUND');
  });

  it('answers not found for a signed-out visitor, so the section does not announce itself', async () => {
    signedOut();

    await expect(requireApprover('approver')).rejects.toThrow('NOT_FOUND');
  });
});
