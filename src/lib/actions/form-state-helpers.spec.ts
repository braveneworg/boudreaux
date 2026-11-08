/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { FormState } from '@/lib/types/form-state';

import {
  applyServiceFailure,
  type FailureFieldTable,
  refusalCopy,
  refusedFormState,
} from './form-state-helpers';

describe('refusedFormState', () => {
  it('carries the gate refusal copy as the general form error', () => {
    expect(
      refusedFormState({ success: false, error: 'Account suspended', code: 'BANNED' })
    ).toEqual({ fields: {}, success: false, errors: { general: ['Account suspended'] } });
  });
});

describe('refusalCopy', () => {
  it("uses the form's own sign-in prompt when there is no session", () => {
    expect(
      refusalCopy({ success: false, error: 'Unauthorized', code: 'UNAUTHENTICATED' }, 'Sign in')
    ).toBe('Sign in');
  });

  it("uses the gate's copy for a banned account", () => {
    expect(
      refusalCopy({ success: false, error: 'Account suspended', code: 'BANNED' }, 'Sign in')
    ).toBe('Account suspended');
  });
});

describe('applyServiceFailure', () => {
  const table: FailureFieldTable = {
    fields: new Map([['DUPLICATE', { field: 'title', message: 'Title taken.' }]]),
    fallback: 'Failed to save',
  };
  const freshState = (): FormState => ({ fields: {}, success: true });

  it("marks the code's field with the table's copy, not the service's", () => {
    const formState = freshState();

    applyServiceFailure(formState, { code: 'DUPLICATE', error: 'Anything at all' }, table);

    expect(formState).toEqual({ fields: {}, success: false, errors: { title: ['Title taken.'] } });
  });

  it('uses the fallback copy as the general error for an unmapped code', () => {
    const formState = freshState();

    applyServiceFailure(formState, { code: 'UNKNOWN', error: 'title already exists' }, table);

    expect(formState.errors).toEqual({ general: ['Failed to save'] });
  });

  it("shows the service's copy as the general error when the table has no fallback", () => {
    const formState = freshState();

    applyServiceFailure(
      formState,
      { code: 'UNAVAILABLE', error: 'Database unavailable' },
      { fields: new Map() }
    );

    expect(formState.errors).toEqual({ general: ['Database unavailable'] });
  });

  it('replaces any errors already on the form', () => {
    const formState: FormState = { fields: {}, success: false, errors: { prior: ['stale'] } };

    applyServiceFailure(formState, { code: 'DUPLICATE', error: '' }, table);

    expect(formState.errors).toEqual({ title: ['Title taken.'] });
  });
});
