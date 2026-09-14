// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { StrictMode, type ReactNode } from 'react';

import { act, renderHook, waitFor } from '@testing-library/react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { lookupPairKey } from './release-date-lookup-policy';
import { useDescriptionAutoGenerate } from './use-description-auto-generate';
import { useVideoDescriptionLookupQuery } from '../_hooks/use-video-description-lookup-query';

vi.mock('server-only', () => ({}));

const mockRefetch = vi.hoisted(() => vi.fn());
vi.mock('../_hooks/use-video-description-lookup-query', () => ({
  useVideoDescriptionLookupQuery: vi.fn(() => ({
    isFetching: false,
    error: null,
    data: undefined,
    refetch: mockRefetch,
  })),
}));

const generated = { data: { description: 'A generated description.', sources: [] } };
const PAIR = lookupPairKey('t', 'a');

interface HarnessOptions {
  lookupResolvedKey?: string | null;
  description?: string;
  releasedOn?: string;
  strict?: boolean;
}

const renderAutoGenerate = ({
  lookupResolvedKey = PAIR,
  description = '',
  releasedOn = '2020-06-01',
  strict = false,
}: HarnessOptions = {}) => {
  let formRef: UseFormReturn<VideoFormData> | undefined;
  const Wrapper = ({ children }: { children: ReactNode }) =>
    strict ? <StrictMode>{children}</StrictMode> : <>{children}</>;
  const hook = renderHook(
    (props: { lookupResolvedKey: string | null }) => {
      const form = useForm<VideoFormData>({
        defaultValues: { title: 't', artist: 'a', releasedOn, description },
      });
      formRef = form;
      useDescriptionAutoGenerate({ form, ...props });
      return { descriptionDirty: Boolean(form.formState.dirtyFields.description) };
    },
    { initialProps: { lookupResolvedKey }, wrapper: Wrapper }
  );
  const getForm = (): UseFormReturn<VideoFormData> => {
    if (!formRef) throw new Error('form not rendered');
    return formRef;
  };
  return { ...hook, getForm };
};

beforeEach(() => {
  mockRefetch.mockReset();
  mockRefetch.mockResolvedValue(generated);
});

describe('useDescriptionAutoGenerate', () => {
  it('does nothing before the lookup has resolved', async () => {
    renderAutoGenerate({ lookupResolvedKey: null });

    await act(async () => {});

    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it('does nothing when the resolved key is for another pair', async () => {
    renderAutoGenerate({ lookupResolvedKey: lookupPairKey('other', 'pair') });

    await act(async () => {});

    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it('generates once for the current pair when the description is blank', async () => {
    const { getForm } = renderAutoGenerate();

    await waitFor(() =>
      expect(getForm().getValues('description')).toBe('A generated description.')
    );
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('marks the generated description dirty', async () => {
    const { result } = renderAutoGenerate();

    await waitFor(() => expect(result.current.descriptionDirty).toBe(true));
  });

  it('passes the title, artist, and day to the lookup query', () => {
    renderAutoGenerate();

    expect(vi.mocked(useVideoDescriptionLookupQuery)).toHaveBeenCalledWith('t', 'a', '2020-06-01');
  });

  it('passes no day when the date is empty', () => {
    renderAutoGenerate({ releasedOn: '' });

    expect(vi.mocked(useVideoDescriptionLookupQuery)).toHaveBeenCalledWith('t', 'a', undefined);
  });

  it('skips a description that already has text', async () => {
    renderAutoGenerate({ description: 'Hand-written.' });

    await act(async () => {});

    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it('never overwrites text typed while the request was in flight', async () => {
    let resolveLookup: (value: unknown) => void = () => undefined;
    mockRefetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLookup = resolve;
        })
    );
    const { getForm } = renderAutoGenerate();
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));

    await act(async () => {
      getForm().setValue('description', 'Typed meanwhile.', { shouldDirty: true });
    });
    await act(async () => {
      resolveLookup(generated);
    });

    expect(getForm().getValues('description')).toBe('Typed meanwhile.');
  });

  it('fires once per triple even under StrictMode double effects', async () => {
    const { getForm } = renderAutoGenerate({ strict: true });

    await waitFor(() =>
      expect(getForm().getValues('description')).toBe('A generated description.')
    );
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('does not fire again for the same triple after the text is cleared', async () => {
    const { getForm } = renderAutoGenerate();
    await waitFor(() =>
      expect(getForm().getValues('description')).toBe('A generated description.')
    );

    await act(async () => {
      getForm().setValue('description', '');
    });
    await act(async () => {});

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('treats a new release date as a new triple', async () => {
    mockRefetch.mockResolvedValueOnce({ data: null });
    const { getForm } = renderAutoGenerate();
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));

    await act(async () => {
      getForm().setValue('releasedOn', '2021-01-01');
    });

    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(2));
  });

  it('stays silent and consumes the triple when nothing is generated', async () => {
    mockRefetch.mockResolvedValueOnce({ data: null });
    const { getForm, rerender } = renderAutoGenerate();
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));

    rerender({ lookupResolvedKey: PAIR });
    await act(async () => {});

    expect(getForm().getValues('description')).toBe('');
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('stays silent when the request rejects', async () => {
    mockRefetch.mockRejectedValueOnce(new Error('rate limited'));
    const { getForm } = renderAutoGenerate();

    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
    await act(async () => {});

    expect(getForm().getValues('description')).toBe('');
  });
});
