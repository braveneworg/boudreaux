// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook, waitFor } from '@testing-library/react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

import { useDebounce } from '@/hooks/use-debounce';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import {
  RELEASE_DATE_AUTOSAVE_DEBOUNCE_MS,
  useReleaseDateAutosave,
} from './use-release-date-autosave';

vi.mock('server-only', () => ({}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const mockUpdate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/mutations/use-video-mutations', () => ({
  useUpdateVideoReleaseDateMutation: () => ({
    updateVideoReleaseDate: vi.fn(),
    updateVideoReleaseDateAsync: mockUpdate,
    isUpdatingVideoReleaseDate: false,
  }),
}));

// Pass-through debounce: the write fires as soon as the value settles.
vi.mock('@/hooks/use-debounce', () => ({ useDebounce: vi.fn((value: unknown) => value) }));

interface HarnessOptions {
  /** `null` renders with no row id (a form whose draft has not been created). */
  videoId?: string | null;
  persistedReleasedOn?: string;
  releasedOn?: string;
}

const renderAutosave = ({
  videoId = 'video-1',
  persistedReleasedOn = '',
  releasedOn = '',
}: HarnessOptions = {}) => {
  let formRef: UseFormReturn<VideoFormData> | undefined;
  const hook = renderHook(
    (props: { videoId: string | undefined; persistedReleasedOn: string }) => {
      const form = useForm<VideoFormData>({
        defaultValues: { title: 't', artist: 'a', releasedOn },
      });
      // The real form registers the field through its DatePicker controller;
      // `resetField` is a no-op on an unregistered field.
      form.register('releasedOn');
      formRef = form;
      useReleaseDateAutosave({ form, ...props });
      // Read dirtyFields during render so the proxy tracks it for assertions.
      return { releasedOnDirty: Boolean(form.formState.dirtyFields.releasedOn) };
    },
    { initialProps: { videoId: videoId ?? undefined, persistedReleasedOn } }
  );
  const getForm = (): UseFormReturn<VideoFormData> => {
    if (!formRef) throw new Error('form not rendered');
    return formRef;
  };
  const setDate = async (value: string): Promise<void> => {
    await act(async () => {
      getForm().setValue('releasedOn', value, { shouldDirty: true });
    });
  };
  return { ...hook, getForm, setDate };
};

beforeEach(() => {
  mockUpdate.mockReset();
  mockUpdate.mockResolvedValue({ success: true });
});

describe('useReleaseDateAutosave', () => {
  it('debounces the field with the module constant', () => {
    renderAutosave();

    expect(vi.mocked(useDebounce)).toHaveBeenCalledWith('', RELEASE_DATE_AUTOSAVE_DEBOUNCE_MS);
  });

  it('writes nothing when no row exists yet', async () => {
    const { setDate } = renderAutosave({ videoId: null });

    await setDate('2020-06-01');

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('writes the day once a row exists', async () => {
    const { setDate } = renderAutosave();

    await setDate('2020-06-01');

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ videoId: 'video-1', releasedOn: '2020-06-01' })
    );
  });

  it('normalises an ISO datetime to its local day before writing', async () => {
    const { setDate } = renderAutosave();

    await setDate(new Date(2020, 5, 1, 0, 0, 0).toISOString());

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ videoId: 'video-1', releasedOn: '2020-06-01' })
    );
  });

  it('skips a value that is not a calendar date', async () => {
    const { setDate } = renderAutosave();

    await setDate('not-a-date');

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('skips a cleared field (Save still requires a date)', async () => {
    const { setDate } = renderAutosave({ releasedOn: '2020-06-01', persistedReleasedOn: '' });
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    mockUpdate.mockClear();

    await setDate('');

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('writes nothing on edit-open when the form holds the persisted day', async () => {
    renderAutosave({ releasedOn: '2020-06-01', persistedReleasedOn: '2020-06-01' });

    await act(async () => {});

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('writes a value that differs from the persisted day', async () => {
    const { setDate } = renderAutosave({
      releasedOn: '2020-06-01',
      persistedReleasedOn: '2020-06-01',
    });

    await setDate('2021-01-01');

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ videoId: 'video-1', releasedOn: '2021-01-01' })
    );
  });

  it('does not write the same day twice', async () => {
    const { setDate, rerender } = renderAutosave();

    await setDate('2020-06-01');
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    rerender({ videoId: 'video-1', persistedReleasedOn: '' });
    await act(async () => {});

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('resets the field clean once the write succeeds', async () => {
    const { setDate, result } = renderAutosave();

    await setDate('2020-06-01');

    await waitFor(() => expect(result.current.releasedOnDirty).toBe(false));
  });

  it('keeps the saved day as the field value after the clean reset', async () => {
    const { setDate, getForm } = renderAutosave();

    await setDate('2020-06-01');

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(getForm().getValues('releasedOn')).toBe('2020-06-01');
  });

  it('keeps a newer value dirty while an older write is in flight', async () => {
    let resolveWrite: (value: unknown) => void = () => undefined;
    // Both writes stay open so the assertion lands mid round-trip.
    mockUpdate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        })
    );
    const { setDate, result } = renderAutosave();
    await setDate('2020-06-01');
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    const resolveFirst = resolveWrite;

    await setDate('2021-01-01');
    await act(async () => {
      resolveFirst({ success: true });
    });

    // The older write settling must not reset the field clean around the newer value.
    expect(result.current.releasedOnDirty).toBe(true);
    mockUpdate.mockReset();
  });

  it('writes the newer value once the older write has settled', async () => {
    let resolveWrite: (value: unknown) => void = () => undefined;
    mockUpdate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        })
    );
    const { setDate, result } = renderAutosave();
    await setDate('2020-06-01');
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    await setDate('2021-01-01');

    await act(async () => {
      resolveWrite({ success: true });
    });

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenLastCalledWith({ videoId: 'video-1', releasedOn: '2021-01-01' })
    );
    await waitFor(() => expect(result.current.releasedOnDirty).toBe(false));
  });

  it('toasts and stays dirty when the action reports failure', async () => {
    mockUpdate.mockResolvedValueOnce({ success: false, error: 'nope' });
    const { setDate, result } = renderAutosave();

    await setDate('2020-06-01');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not save the release date — try again.')
    );
    expect(result.current.releasedOnDirty).toBe(true);
  });

  it('does not retry the same failed day on its own', async () => {
    mockUpdate.mockResolvedValueOnce({ success: false, error: 'nope' });
    const { setDate } = renderAutosave();

    await setDate('2020-06-01');
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    await act(async () => {});

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('retries once the value changes after a failure', async () => {
    mockUpdate.mockResolvedValueOnce({ success: false, error: 'nope' });
    const { setDate } = renderAutosave();
    await setDate('2020-06-01');
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));

    await setDate('2021-01-01');

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenLastCalledWith({ videoId: 'video-1', releasedOn: '2021-01-01' })
    );
  });

  it('toasts when the action throws', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('boom'));
    const { setDate } = renderAutosave();

    await setDate('2020-06-01');

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not save the release date — try again.')
    );
  });

  it('writes once the row id appears', async () => {
    const { setDate, rerender } = renderAutosave({ videoId: null });
    await setDate('2020-06-01');
    expect(mockUpdate).not.toHaveBeenCalled();

    rerender({ videoId: 'video-1', persistedReleasedOn: '' });

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith({ videoId: 'video-1', releasedOn: '2020-06-01' })
    );
  });
});
