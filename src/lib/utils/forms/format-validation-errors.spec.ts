/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { formatValidationErrors } from './format-validation-errors';

describe('formatValidationErrors', () => {
  it('names each failing field with its message', () => {
    expect(
      formatValidationErrors({ title: { message: 'Title is required' }, slug: { message: 'Bad' } })
    ).toBe('title: Title is required, slug: Bad');
  });

  it('says "Invalid" for a field without a message', () => {
    expect(formatValidationErrors({ title: {} })).toBe('title: Invalid');
  });

  it('falls back to a generic prompt when no field failed', () => {
    expect(formatValidationErrors({})).toBe('Please check the form for errors.');
  });
});
