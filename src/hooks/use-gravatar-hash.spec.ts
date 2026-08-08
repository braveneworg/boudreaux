/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';

import { renderHook, waitFor } from '@testing-library/react';

import { useGravatarHash } from './use-gravatar-hash';

describe('useGravatarHash', () => {
  beforeAll(() => {
    // jsdom does not implement SubtleCrypto; Node's webcrypto is the same
    // W3C Web Crypto API the browser provides.
    vi.stubGlobal('crypto', webcrypto);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('returns an empty string when no email is given', () => {
    const { result } = renderHook(() => useGravatarHash(undefined));

    expect(result.current).toBe('');
  });

  it('resolves the Gravatar-documented SHA-256 hash of the email', async () => {
    // Reference: https://docs.gravatar.com/api/avatars/hash/
    const { result } = renderHook(() => useGravatarHash('MyEmailAddress@example.com '));

    await waitFor(() => {
      expect(result.current).toBe(
        '84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee'
      );
    });
  });

  it('normalizes case and whitespace before hashing', async () => {
    const { result: mixed } = renderHook(() => useGravatarHash('Test@Example.com'));
    const { result: plain } = renderHook(() => useGravatarHash('  test@example.com  '));

    await waitFor(() => {
      expect(mixed.current).toMatch(/^[a-f0-9]{64}$/);
    });
    await waitFor(() => {
      expect(plain.current).toBe(mixed.current);
    });
  });

  it('recomputes the hash when the email changes', async () => {
    const { result, rerender } = renderHook(
      ({ email }: { email: string }) => useGravatarHash(email),
      {
        initialProps: { email: 'a@example.com' },
      }
    );

    await waitFor(() => {
      expect(result.current).toMatch(/^[a-f0-9]{64}$/);
    });
    const first = result.current;

    rerender({ email: 'b@example.com' });

    await waitFor(() => {
      expect(result.current).toMatch(/^[a-f0-9]{64}$/);
      expect(result.current).not.toBe(first);
    });
  });

  it('resets to an empty string when the email is cleared', async () => {
    const { result, rerender } = renderHook(
      ({ email }: { email: string | undefined }) => useGravatarHash(email),
      { initialProps: { email: 'a@example.com' as string | undefined } }
    );

    await waitFor(() => {
      expect(result.current).toMatch(/^[a-f0-9]{64}$/);
    });

    rerender({ email: undefined });

    await waitFor(() => {
      expect(result.current).toBe('');
    });
  });
});
