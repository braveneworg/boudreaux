/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { refusedFormState } from './form-state-helpers';

describe('refusedFormState', () => {
  it('carries the gate refusal copy as the general form error', () => {
    expect(
      refusedFormState({ success: false, error: 'Account suspended', code: 'BANNED' })
    ).toEqual({ fields: {}, success: false, errors: { general: ['Account suspended'] } });
  });
});
