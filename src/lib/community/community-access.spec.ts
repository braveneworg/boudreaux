/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { mayUseCommunity } from './community-access';

describe('mayUseCommunity (before launch)', () => {
  it.each(['admin', 'manager'])('admits the %s role', (role) => {
    expect(mayUseCommunity(role)).toBe(true);
  });

  it.each(['user', null, undefined])('refuses %s', (role) => {
    expect(mayUseCommunity(role)).toBe(false);
  });
});
