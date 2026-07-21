// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook, waitFor } from '@testing-library/react';

import { createQueryWrapper } from '@/test-utils/create-query-wrapper';

import { useEntityMutation } from './use-entity-mutation';

interface TestVariables {
  id: string;
}

/**
 * Render the factory with a real `QueryClientProvider`, so the invalidation
 * policy is exercised through the same seam a component crosses rather than
 * through a mocked `useMutation`.
 */
const renderEntityMutation = (
  mutationFn: (variables: TestVariables) => Promise<{ success: boolean }>,
  invalidate: (queryClient: unknown) => Promise<unknown>
) =>
  renderHook(() => useEntityMutation<{ success: boolean }, TestVariables>(mutationFn, invalidate), {
    wrapper: createQueryWrapper(),
  });

describe('useEntityMutation', () => {
  it('runs the action with the variables the caller supplied', async () => {
    const mutationFn = vi.fn<(variables: TestVariables) => Promise<{ success: boolean }>>(
      async () => ({ success: true })
    );
    const { result } = renderEntityMutation(mutationFn, async () => undefined);

    await result.current.mutateAsync({ id: 'e-1' });

    // TanStack passes a second context argument, so assert on the variables only.
    expect(mutationFn.mock.calls[0]?.[0]).toEqual({ id: 'e-1' });
  });

  it('resolves with the action result so callers can read its fields', async () => {
    const { result } = renderEntityMutation(
      async () => ({ success: true }),
      async () => undefined
    );

    const resolved = await result.current.mutateAsync({ id: 'e-1' });

    expect(resolved).toEqual({ success: true });
  });

  it('invalidates the entity caches when the action reports success', async () => {
    const invalidate = vi.fn(async () => undefined);
    const { result } = renderEntityMutation(async () => ({ success: true }), invalidate);

    await result.current.mutateAsync({ id: 'e-1' });

    expect(invalidate).toHaveBeenCalledOnce();
  });

  it('does not invalidate when the action reports failure', async () => {
    const invalidate = vi.fn(async () => undefined);
    const { result } = renderEntityMutation(async () => ({ success: false }), invalidate);

    await result.current.mutateAsync({ id: 'e-1' });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('hands the live query client to the invalidator', async () => {
    const invalidate = vi.fn<(queryClient: unknown) => Promise<unknown>>(async () => undefined);
    const { result } = renderEntityMutation(async () => ({ success: true }), invalidate);

    await result.current.mutateAsync({ id: 'e-1' });

    expect(invalidate.mock.calls[0]?.[0]).toHaveProperty('invalidateQueries');
  });

  it('reports pending state while the action is in flight', async () => {
    let settle = (): void => undefined;
    const mutationFn = vi.fn(
      () =>
        new Promise<{ success: boolean }>((resolve) => {
          settle = () => resolve({ success: true });
        })
    );
    const { result } = renderEntityMutation(mutationFn, async () => undefined);

    result.current.mutate({ id: 'e-1' });
    await waitFor(() => expect(result.current.isPending).toBe(true));
    settle();

    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it('rejects when the action throws so callers can handle it via onError', async () => {
    const invalidate = vi.fn(async () => undefined);
    const { result } = renderEntityMutation(async () => {
      throw new Error('action exploded');
    }, invalidate);

    await expect(result.current.mutateAsync({ id: 'e-1' })).rejects.toThrow('action exploded');
  });

  it('does not invalidate when the action throws', async () => {
    const invalidate = vi.fn(async () => undefined);
    const { result } = renderEntityMutation(async () => {
      throw new Error('action exploded');
    }, invalidate);

    await expect(result.current.mutateAsync({ id: 'e-1' })).rejects.toThrow();

    expect(invalidate).not.toHaveBeenCalled();
  });
});
