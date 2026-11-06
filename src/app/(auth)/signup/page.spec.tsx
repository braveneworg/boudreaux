/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import SignupRoute from './page';

const enabledSocialProvidersMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/config/runtime-config', () => ({
  enabledSocialProviders: enabledSocialProvidersMock,
}));

vi.mock('./signup-page', () => ({
  SignupPage: ({ socialProviders }: { socialProviders: readonly string[] }) => (
    <div data-testid="signup-page" data-social-providers={socialProviders.join(',')} />
  ),
}));

describe('signup route', () => {
  it('offers only the social providers the server registered', () => {
    enabledSocialProvidersMock.mockReturnValueOnce(['apple', 'google']);

    render(<SignupRoute />);

    expect(screen.getByTestId('signup-page')).toHaveAttribute(
      'data-social-providers',
      'apple,google'
    );
  });
});
