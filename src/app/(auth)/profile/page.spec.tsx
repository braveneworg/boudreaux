/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import ProfilePage from './page';

const enabledSocialProvidersMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/config/runtime-config', () => ({
  enabledSocialProviders: enabledSocialProvidersMock,
}));

vi.mock('@/app/components/forms/profile-form', () => ({
  ProfileForm: ({ socialProviders }: { socialProviders: readonly string[] }) => (
    <div data-testid="profile-form" data-social-providers={socialProviders.join(',')} />
  ),
}));

describe('profile page', () => {
  it('hands the profile form the social providers the server registered', async () => {
    enabledSocialProvidersMock.mockReturnValueOnce(['google', 'facebook']);

    render(await ProfilePage());

    expect(screen.getByTestId('profile-form')).toHaveAttribute(
      'data-social-providers',
      'google,facebook'
    );
  });
});
