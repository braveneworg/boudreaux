/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { setFormErrors } from './set-form-errors';

describe('set-form-errors', () => {
  it('returns no general error when formState has no errors', () => {
    const setError = vi.fn();

    const result = setFormErrors(setError, { errors: undefined });

    expect(result.generalError).toBeUndefined();
  });

  it('does not call setError when formState has no errors', () => {
    const setError = vi.fn();

    setFormErrors(setError, { errors: undefined });

    expect(setError).not.toHaveBeenCalled();
  });

  it('maps a field error onto the form with a server error type', () => {
    const setError = vi.fn();

    setFormErrors(setError, { errors: { title: ['Title is required'] } });

    expect(setError).toHaveBeenCalledWith('title', {
      type: 'server',
      message: 'Title is required',
    });
  });

  it('uses the first message when a field has multiple errors', () => {
    const setError = vi.fn();

    setFormErrors(setError, { errors: { title: ['First', 'Second'] } });

    expect(setError).toHaveBeenCalledWith('title', { type: 'server', message: 'First' });
  });

  it('returns the general message instead of mapping it to a field', () => {
    const setError = vi.fn();

    const result = setFormErrors(setError, { errors: { general: ['Something broke'] } });

    expect(result.generalError).toBe('Something broke');
  });

  it('does not call setError for the general key', () => {
    const setError = vi.fn();

    setFormErrors(setError, { errors: { general: ['Something broke'] } });

    expect(setError).not.toHaveBeenCalled();
  });

  it('skips fields whose message array is empty', () => {
    const setError = vi.fn();

    setFormErrors(setError, { errors: { title: [] } });

    expect(setError).not.toHaveBeenCalled();
  });

  it('maps field errors while returning the general message together', () => {
    const setError = vi.fn();

    const result = setFormErrors(setError, {
      errors: { title: ['Required'], general: ['Server down'] },
    });

    expect(result.generalError).toBe('Server down');
  });
});
