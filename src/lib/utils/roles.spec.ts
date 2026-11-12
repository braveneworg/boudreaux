/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isAdminRole, isApproverRole } from './roles';

describe('isAdminRole', () => {
  it('passes the admin role', () => {
    expect(isAdminRole('admin')).toBe(true);
  });

  it.each(['manager', 'user', '', null, undefined])('refuses %s', (role) => {
    expect(isAdminRole(role)).toBe(false);
  });
});

describe('isApproverRole', () => {
  it.each(['admin', 'manager'])('passes the %s role', (role) => {
    expect(isApproverRole(role)).toBe(true);
  });

  it.each(['user', 'Admin', '', null, undefined])('refuses %s', (role) => {
    expect(isApproverRole(role)).toBe(false);
  });
});
