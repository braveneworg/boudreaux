/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { auth } from '@/auth';
import { UserRepository } from '@/lib/repositories/user-repository';
import { EMPTY_FORM_STATE } from '@/lib/types/form-state';

import { updateProfileAction } from './update-profile-action';

// `update-profile-action.spec.ts` mocks `getActionState`; this spec runs the
// real schema against FormData shaped like `profile-form.tsx` builds it, where
// every value — ZIP code, phone, and the opt-in switches — is a string (#790).

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/repositories/user-repository');
vi.mock('@/lib/utils/audit-log');

const buildProfileFormData = (entries: Record<string, string>): FormData => {
  const payload = new FormData();
  for (const [key, value] of Object.entries(entries)) payload.append(key, value);
  return payload;
};

describe('updateProfileAction with the real schema', () => {
  beforeEach(() => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
  });

  it('saves a numeric ZIP code and phone as strings and the switches as booleans', async () => {
    const result = await updateProfileAction(
      EMPTY_FORM_STATE,
      buildProfileFormData({
        firstName: 'Ann',
        lastName: 'Lee',
        phone: '5551234567',
        zipCode: '02139',
        allowSmsNotifications: 'true',
        allowEmailNotifications: 'false',
      })
    );

    expect(result.success).toBe(true);
    expect(vi.mocked(UserRepository.updateProfile).mock.calls).toEqual([
      [
        'user-1',
        expect.objectContaining({
          phone: '5551234567',
          zipCode: '02139',
          allowSmsNotifications: true,
          allowEmailNotifications: false,
        }),
      ],
    ]);
  });
});
