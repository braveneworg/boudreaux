/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { FormState } from '@/lib/types/form-state';
import { applyZodIssuesToFormState } from '@/lib/utils/form-state-helpers';

const baseState = (): FormState => ({ fields: {}, success: false });

describe('applyZodIssuesToFormState', () => {
  it('maps a single issue to its first-path-segment field', () => {
    const state = baseState();
    applyZodIssuesToFormState(state, { issues: [{ path: ['email'], message: 'Invalid email' }] });
    expect(state.errors?.email).toEqual(['Invalid email']);
  });

  it('maps an issue with an empty path to the general field', () => {
    const state = baseState();
    applyZodIssuesToFormState(state, { issues: [{ path: [], message: 'Form is invalid' }] });
    expect(state.errors?.general).toEqual(['Form is invalid']);
  });

  it('appends multiple issues for the same field in order', () => {
    const state = baseState();
    applyZodIssuesToFormState(state, {
      issues: [
        { path: ['username'], message: 'Too short' },
        { path: ['username'], message: 'Already taken' },
      ],
    });
    expect(state.errors?.username).toEqual(['Too short', 'Already taken']);
  });

  it('seeds from and appends to pre-existing field errors', () => {
    const state: FormState = { fields: {}, success: false, errors: { username: ['First'] } };
    applyZodIssuesToFormState(state, { issues: [{ path: ['username'], message: 'Second' }] });
    expect(state.errors?.username).toEqual(['First', 'Second']);
  });

  it('returns the same FormState reference it was given', () => {
    const state = baseState();
    const result = applyZodIssuesToFormState(state, { issues: [] });
    expect(result).toBe(state);
  });

  it('coerces a numeric path segment to a string field key', () => {
    const state = baseState();
    applyZodIssuesToFormState(state, { issues: [{ path: [0], message: 'Bad index' }] });
    expect(state.errors?.['0']).toEqual(['Bad index']);
  });
});
