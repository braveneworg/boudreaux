// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook, waitFor } from '@testing-library/react';

import { resetFingerprintAgentForTesting, useFingerprint } from './use-fingerprint';

const getMock = vi.fn();
const loadMock = vi.fn();

vi.mock('@fingerprintjs/fingerprintjs', () => ({
  default: { load: (...args: unknown[]) => loadMock(...args) },
}));

beforeEach(() => {
  resetFingerprintAgentForTesting();
  loadMock.mockReset();
  getMock.mockReset();
  loadMock.mockResolvedValue({ get: getMock });
});

describe('useFingerprint', () => {
  it('returns isReady=false and a null fingerprint before resolution', () => {
    getMock.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useFingerprint());

    expect(result.current.fingerprint).toBeNull();
    expect(result.current.isReady).toBe(false);
  });

  it('resolves the visitor id and flips isReady to true', async () => {
    getMock.mockResolvedValue({ visitorId: 'visitor-abc' });

    const { result } = renderHook(() => useFingerprint());

    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.fingerprint).toBe('visitor-abc');
  });

  it('loads the FingerprintJS agent at most once across multiple hook callers', async () => {
    getMock.mockResolvedValue({ visitorId: 'visitor-abc' });

    renderHook(() => useFingerprint());
    renderHook(() => useFingerprint());
    renderHook(() => useFingerprint());

    await waitFor(() => expect(getMock).toHaveBeenCalled());

    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it('does not update state after unmount (cancellation guard)', async () => {
    let resolveGet: ((value: { visitorId: string }) => void) | null = null;
    getMock.mockReturnValue(
      new Promise<{ visitorId: string }>((resolve) => {
        resolveGet = resolve;
      })
    );

    const { result, unmount } = renderHook(() => useFingerprint());

    unmount();

    await act(async () => {
      resolveGet?.({ visitorId: 'late' });
    });

    expect(result.current.fingerprint).toBeNull();
  });

  it('logs and tolerates FingerprintJS failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getMock.mockRejectedValue(Error('crypto blocked'));

    const { result } = renderHook(() => useFingerprint());

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(result.current.fingerprint).toBeNull();
    expect(result.current.isReady).toBe(false);

    errorSpy.mockRestore();
  });
});
