// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Form } from '@/app/components/ui/form';
import { createVideoSchema } from '@/lib/validation/create-video-schema';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { DescriptionField } from './description-field';
import { useVideoDescriptionLookupQuery } from '../_hooks/use-video-description-lookup-query';

import type { UseFormSetValue } from 'react-hook-form';

const mockRefetch = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../_hooks/use-video-description-lookup-query', () => ({
  useVideoDescriptionLookupQuery: vi.fn(() => ({
    isFetching: false,
    error: null,
    data: undefined,
    refetch: mockRefetch,
  })),
}));

const GENERATED = {
  description: 'A ~500-character piece naming the artist — "quoted line" — Some Zine.',
  confidence: 'medium' as const,
  sources: ['https://example.com/review'],
};

interface WrapperProps {
  setValueRef: React.MutableRefObject<UseFormSetValue<VideoFormData> | null>;
}

const Wrapper = ({ setValueRef }: WrapperProps): React.ReactElement => {
  const form = useForm<VideoFormData>({
    resolver: zodResolver(createVideoSchema),
    defaultValues: {
      title: '',
      artist: '',
      category: 'MUSIC',
      description: '',
      releasedOn: '',
      s3Key: '',
      fileName: '',
      mimeType: 'video/mp4',
    },
  });

  setValueRef.current = form.setValue;

  return (
    <Form {...form}>
      <DescriptionField control={form.control} setValue={form.setValue} />
    </Form>
  );
};

const makeSetValueRef = (): React.MutableRefObject<UseFormSetValue<VideoFormData> | null> => ({
  current: null,
});

/** Render and push a valid title + artist into the form. */
const renderReady = (): React.MutableRefObject<UseFormSetValue<VideoFormData> | null> => {
  const setValueRef = makeSetValueRef();
  render(<Wrapper setValueRef={setValueRef} />);
  act(() => {
    setValueRef.current?.('title', 'Some Song');
    setValueRef.current?.('artist', 'Some Band');
  });
  return setValueRef;
};

describe('DescriptionField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useVideoDescriptionLookupQuery).mockReturnValue({
      isFetching: false,
      error: null,
      data: undefined,
      refetch: mockRefetch,
    });
  });

  it('renders the description textarea', () => {
    const setValueRef = makeSetValueRef();
    render(<Wrapper setValueRef={setValueRef} />);
    expect(screen.getByPlaceholderText('Video description')).toBeInTheDocument();
  });

  it('disables the generate button when the title is empty', () => {
    const setValueRef = makeSetValueRef();
    render(<Wrapper setValueRef={setValueRef} />);

    act(() => {
      setValueRef.current?.('artist', 'Some Band');
    });

    expect(screen.getByRole('button', { name: 'Generate description' })).toBeDisabled();
  });

  it('disables the generate button when the artist is empty', () => {
    const setValueRef = makeSetValueRef();
    render(<Wrapper setValueRef={setValueRef} />);

    act(() => {
      setValueRef.current?.('title', 'Some Song');
    });

    expect(screen.getByRole('button', { name: 'Generate description' })).toBeDisabled();
  });

  it('enables the generate button when title and artist are set', () => {
    renderReady();

    expect(screen.getByRole('button', { name: 'Generate description' })).not.toBeDisabled();
  });

  it('shows "Generating…" and disables the button while fetching', () => {
    vi.mocked(useVideoDescriptionLookupQuery).mockReturnValue({
      isFetching: true,
      error: null,
      data: undefined,
      refetch: mockRefetch,
    });
    renderReady();

    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();
  });

  it('forwards a valid release date to the lookup and omits a blank one', () => {
    const setValueRef = renderReady();

    act(() => {
      setValueRef.current?.('releasedOn', '2021-04-09');
    });

    expect(vi.mocked(useVideoDescriptionLookupQuery)).toHaveBeenLastCalledWith(
      'Some Song',
      'Some Band',
      '2021-04-09'
    );
  });

  it('fills the description field and toasts success on generation', async () => {
    mockRefetch.mockResolvedValue({ data: GENERATED, error: null, status: 'success' });
    renderReady();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Generate description' }));
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Video description')).toHaveValue(GENERATED.description);
    });
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining('https://example.com/review')
    );
  });

  it('toasts a plain success when the generation cites no sources', async () => {
    mockRefetch.mockResolvedValue({
      data: { ...GENERATED, sources: [] },
      error: null,
      status: 'success',
    });
    renderReady();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Generate description' }));
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Generated a description');
    });
  });

  it('toasts info when nothing could be generated', async () => {
    mockRefetch.mockResolvedValue({ data: null, error: null, status: 'success' });
    renderReady();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Generate description' }));
    });

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('No description could be generated');
    });
  });

  it('toasts an error when the lookup resolves with an error', async () => {
    mockRefetch.mockResolvedValue({
      data: undefined,
      error: new Error('boom'),
      status: 'error',
    });
    renderReady();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Generate description' }));
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Description generation failed');
    });
  });

  it('toasts an error when the lookup throws', async () => {
    mockRefetch.mockRejectedValue(new Error('unexpected'));
    renderReady();

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Generate description' }));
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Description generation failed');
    });
  });
});
