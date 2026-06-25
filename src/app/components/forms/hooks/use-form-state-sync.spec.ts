/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';

import { useMatchingFieldErrorClear } from './use-form-state-sync';

import type { Control, UseFormClearErrors } from 'react-hook-form';

interface TestValues {
  email: string;
  confirmEmail: string;
}

const watched = vi.hoisted(() => ({ values: {} as Record<string, unknown> }));

vi.mock('react-hook-form', () => ({
  useWatch: ({ name }: { name: string }) =>
    Object.entries(watched.values).find(([key]) => key === name)?.[1],
}));

// Minimal stand-ins for RHF generics — the hook only forwards them through.
const control = {} as Control<TestValues>;

describe('useMatchingFieldErrorClear', () => {
  beforeEach(() => {
    watched.values = {};
  });

  it('clears the confirm error when both fields match and are truthy', () => {
    watched.values = { email: 'a@b.com', confirmEmail: 'a@b.com' };
    const clearErrors = vi.fn() as unknown as UseFormClearErrors<TestValues>;

    renderHook(() =>
      useMatchingFieldErrorClear({
        control,
        clearErrors,
        fieldName: 'email',
        confirmFieldName: 'confirmEmail',
      })
    );

    expect(clearErrors).toHaveBeenCalledWith('confirmEmail');
  });

  it('does not clear when the two fields differ', () => {
    watched.values = { email: 'a@b.com', confirmEmail: 'c@d.com' };
    const clearErrors = vi.fn() as unknown as UseFormClearErrors<TestValues>;

    renderHook(() =>
      useMatchingFieldErrorClear({
        control,
        clearErrors,
        fieldName: 'email',
        confirmFieldName: 'confirmEmail',
      })
    );

    expect(clearErrors).not.toHaveBeenCalled();
  });

  it('does not clear when the primary field is empty', () => {
    watched.values = { email: '', confirmEmail: '' };
    const clearErrors = vi.fn() as unknown as UseFormClearErrors<TestValues>;

    renderHook(() =>
      useMatchingFieldErrorClear({
        control,
        clearErrors,
        fieldName: 'email',
        confirmFieldName: 'confirmEmail',
      })
    );

    expect(clearErrors).not.toHaveBeenCalled();
  });
});
