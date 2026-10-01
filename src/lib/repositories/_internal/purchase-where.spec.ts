/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { purchaseWhere } from './purchase-where';
import { isPresent, isUnset } from './where-kit';

describe('purchaseWhere', () => {
  it('active and refunded are the null-safe pair over refundedAt', () => {
    expect(purchaseWhere.active).toEqual(isUnset('refundedAt'));
    expect(purchaseWhere.refunded).toEqual(isPresent('refundedAt'));
  });
});
