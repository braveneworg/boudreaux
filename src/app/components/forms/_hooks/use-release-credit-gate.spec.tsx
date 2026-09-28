/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from '@testing-library/react';
import { toast } from 'sonner';

import { useReleaseCreditGate } from './use-release-credit-gate';

const creditDecisions = vi.hoisted(() => ({
  requestDecisions: vi.fn(),
  confirmation: null,
  confirm: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('@/hooks/use-credit-decisions', () => ({
  useCreditDecisions: () => creditDecisions,
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const decisions = { publishArtistIds: ['a'], keepHiddenArtistIds: ['b'] };
const publishing = { publishedAt: '2026-09-27T12:00:00.000Z', artistIds: ['a', 'b'] };

const renderGate = (isPublished = false) => {
  const clearPublishedAt = vi.fn();
  const rendered = renderHook(() => useReleaseCreditGate({ isPublished, clearPublishedAt }));
  return { ...rendered, clearPublishedAt };
};

describe('useReleaseCreditGate', () => {
  beforeEach(() => {
    creditDecisions.requestDecisions.mockResolvedValue(decisions);
  });

  afterEach(() => {
    creditDecisions.requestDecisions.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('lets a save that leaves the release unpublished through without asking', async () => {
    const { result } = renderGate();

    const proceed = await act(() => result.current.resolve({ publishedAt: '', artistIds: ['a'] }));

    expect({ proceed, asked: creditDecisions.requestDecisions.mock.calls }).toEqual({
      proceed: true,
      asked: [],
    });
  });

  it('asks about the artists the form credits when the save publishes', async () => {
    const { result } = renderGate();

    await act(() => result.current.resolve(publishing));

    expect(creditDecisions.requestDecisions.mock.calls).toEqual([[{ artistIds: ['a', 'b'] }]]);
  });

  it('asks about no artists when the form credits none', async () => {
    const { result } = renderGate();

    await act(() => result.current.resolve({ publishedAt: publishing.publishedAt }));

    expect(creditDecisions.requestDecisions.mock.calls).toEqual([[{ artistIds: [] }]]);
  });

  it("proceeds with the admin's decisions", async () => {
    const { result } = renderGate();

    const proceed = await act(() => result.current.resolve(publishing));

    expect({ proceed, decisions: result.current.getDecisions() }).toEqual({
      proceed: true,
      decisions,
    });
  });

  it('carries no decisions from one save into the next', async () => {
    const { result } = renderGate();
    await act(() => result.current.resolve(publishing));

    await act(() => result.current.resolve({ publishedAt: '', artistIds: ['a'] }));

    expect(result.current.getDecisions()).toBeUndefined();
  });

  it('stops the save when the admin cancels', async () => {
    creditDecisions.requestDecisions.mockResolvedValue(null);
    const { result } = renderGate();

    const proceed = await act(() => result.current.resolve(publishing));

    expect(proceed).toBe(false);
  });

  it('takes back the publication date of a release that was not published', async () => {
    creditDecisions.requestDecisions.mockResolvedValue(null);
    const { result, clearPublishedAt } = renderGate(false);

    await act(() => result.current.resolve(publishing));

    expect(clearPublishedAt.mock.calls).toEqual([[]]);
  });

  it('keeps the publication date of a release that is already published', async () => {
    creditDecisions.requestDecisions.mockResolvedValue(null);
    const { result, clearPublishedAt } = renderGate(true);

    await act(() => result.current.resolve(publishing));

    expect(clearPublishedAt.mock.calls).toEqual([]);
  });

  it('stops the save and says why when the credits cannot be loaded', async () => {
    creditDecisions.requestDecisions.mockRejectedValue(
      new Error('Failed to load the credited artists')
    );
    const { result } = renderGate();

    const proceed = await act(() => result.current.resolve(publishing));

    expect({ proceed, toasts: vi.mocked(toast.error).mock.calls }).toEqual({
      proceed: false,
      toasts: [['Failed to load the credited artists']],
    });
  });

  it('hands the dialog its state and answers', () => {
    const { result } = renderGate();

    expect(result.current.dialog).toEqual({
      confirmation: null,
      confirmLabel: 'Publish release',
      onConfirm: creditDecisions.confirm,
      onCancel: creditDecisions.cancel,
    });
  });

  it('labels the dialog as a save for a release that is already published', () => {
    const { result } = renderGate(true);

    expect(result.current.dialog.confirmLabel).toBe('Save release');
  });
});
