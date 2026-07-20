/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { renderHook } from '@testing-library/react';

import { useEntitySubmit } from './use-entity-submit';

const toastErrorMock = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: vi.fn() } }));

const consoleErrorMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/console-logger', () => ({ error: consoleErrorMock }));

interface Values {
  title: string;
}

const values: Values = { title: 'A Title' };

const formEl = {} as HTMLFormElement;

const setup = (overrides: Record<string, unknown> = {}) => {
  const reset = vi.fn();
  const create = vi.fn().mockResolvedValue({ success: true });
  const update = vi.fn().mockResolvedValue({ success: true });
  const onSuccess = vi.fn();

  const { result } = renderHook(() =>
    useEntitySubmit<Values, { success: boolean }>({
      entity: 'artist',
      reset,
      create,
      update,
      onSuccess,
      ...overrides,
    })
  );

  return { submit: result.current, reset, create, update, onSuccess };
};

describe('useEntitySubmit', () => {
  it('creates when there is no entity id', async () => {
    const { submit, create } = setup();

    await submit(formEl, null, values);

    expect(create).toHaveBeenCalledWith(values);
  });

  it('does not update when there is no entity id', async () => {
    const { submit, update } = setup();

    await submit(formEl, null, values);

    expect(update).not.toHaveBeenCalled();
  });

  it('updates when an entity id is present', async () => {
    const { submit, update } = setup();

    await submit(formEl, 'a1', values);

    expect(update).toHaveBeenCalledWith('a1', values);
  });

  it('resets the form to the submitted values on success', async () => {
    const { submit, reset } = setup();

    await submit(formEl, 'a1', values);

    expect(reset).toHaveBeenCalledWith(values);
  });

  it('hands the result and mode to onSuccess', async () => {
    const { submit, onSuccess } = setup();

    await submit(formEl, null, values);

    expect(onSuccess).toHaveBeenCalledWith({ success: true }, values, 'create');
  });

  it('reports the update mode to onSuccess', async () => {
    const { submit, onSuccess } = setup();

    await submit(formEl, 'a1', values);

    expect(onSuccess).toHaveBeenCalledWith({ success: true }, values, 'update');
  });

  /** The failure copy was written out per form; it is one sentence now. */
  it('names the entity and the verb when a create fails', async () => {
    const { submit } = setup({ create: vi.fn().mockResolvedValue({ success: false }) });

    await submit(formEl, null, values);

    expect(toastErrorMock).toHaveBeenCalledWith(
      'Failed to create artist. Please check the form for errors.'
    );
  });

  it('names the update verb when an update fails', async () => {
    const { submit } = setup({ update: vi.fn().mockResolvedValue({ success: false }) });

    await submit(formEl, 'a1', values);

    expect(toastErrorMock).toHaveBeenCalledWith(
      'Failed to update artist. Please check the form for errors.'
    );
  });

  it('does not run onSuccess when the mutation fails', async () => {
    const onSuccess = vi.fn();
    const { submit } = setup({
      create: vi.fn().mockResolvedValue({ success: false }),
      onSuccess,
    });

    await submit(formEl, null, values);

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('does not reset the form when the mutation fails', async () => {
    const { submit, reset } = setup({ create: vi.fn().mockResolvedValue({ success: false }) });

    await submit(formEl, null, values);

    expect(reset).not.toHaveBeenCalled();
  });

  /**
   * A null form ref means the page is in a state the submit cannot trust, so
   * the mutation must not fire at all.
   */
  it('does not submit when the form ref is null', async () => {
    const { submit, create } = setup();

    await submit(null, null, values);

    expect(create).not.toHaveBeenCalled();
  });

  it('tells the user to refresh when the form ref is null', async () => {
    const { submit } = setup();

    await submit(null, null, values);

    expect(toastErrorMock).toHaveBeenCalledWith(
      'Please refresh the page and try again, or check back later.'
    );
  });

  it('logs which form lost its ref', async () => {
    const { submit } = setup();

    await submit(null, null, values);

    expect(consoleErrorMock).toHaveBeenCalledWith('artist form: form reference is null on submit.');
  });
});
