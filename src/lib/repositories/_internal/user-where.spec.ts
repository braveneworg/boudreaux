/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { userWhere } from './user-where';
import { isPresent } from './where-kit';

describe('userWhere', () => {
  it('hasPhone is a present, non-empty phone', () => {
    expect(userWhere.hasPhone).toEqual({ AND: [isPresent('phone'), { phone: { not: '' } }] });
  });

  it('smsReachable adds the opt-in flag to hasPhone', () => {
    expect(userWhere.smsReachable).toEqual({ allowSmsNotifications: true, ...userWhere.hasPhone });
  });
});
