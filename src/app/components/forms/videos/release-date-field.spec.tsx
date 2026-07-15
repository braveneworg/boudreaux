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
import { useReleaseDateLookupQuery } from '@/app/hooks/use-release-date-lookup-query';
import { createVideoSchema } from '@/lib/validation/create-video-schema';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { ReleaseDateField } from './release-date-field';

import type { UseFormSetValue } from 'react-hook-form';

// ---------------------------------------------------------------------------
// Import mocked modules for assertion
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRefetch = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/app/hooks/use-release-date-lookup-query', () => ({
  useReleaseDateLookupQuery: vi.fn(() => ({
    isFetching: false,
    error: null,
    data: undefined,
    refetch: mockRefetch,
  })),
}));

vi.mock('@/ui/datepicker', () => ({
  DatePicker: ({
    onSelect,
    fieldName,
    value,
  }: {
    onSelect?: (dateString: string, fieldName: string) => void;
    fieldName: string;
    value?: string;
  }) => (
    <input
      aria-label="release-date"
      value={value ?? ''}
      onChange={(e) => onSelect?.(e.target.value, fieldName)}
    />
  ),
}));

// ---------------------------------------------------------------------------
// Wrapper — owns a real RHF form. Exposes setValueRef so tests can push
// values into the RHF store after mount (same pattern as video-metadata-section.spec).
// ---------------------------------------------------------------------------

interface WrapperProps {
  onSelectDate?: (dateString: string, fieldName: string) => void;
  setValueRef: React.MutableRefObject<UseFormSetValue<VideoFormData> | null>;
}

const Wrapper = ({ onSelectDate = vi.fn(), setValueRef }: WrapperProps): React.ReactElement => {
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
      <ReleaseDateField control={form.control} onSelectDate={onSelectDate} />
    </Form>
  );
};

const makeSetValueRef = (): React.MutableRefObject<UseFormSetValue<VideoFormData> | null> => ({
  current: null,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReleaseDateField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useReleaseDateLookupQuery).mockReturnValue({
      isFetching: false,
      error: null,
      data: undefined,
      refetch: mockRefetch,
    });
  });

  it('disables the find button when the title is empty', () => {
    const setValueRef = makeSetValueRef();
    render(<Wrapper setValueRef={setValueRef} />);
    expect(screen.getByRole('button', { name: 'Find release date' })).toBeDisabled();
  });

  it('enables the find button when the title has a value', () => {
    const setValueRef = makeSetValueRef();
    render(<Wrapper setValueRef={setValueRef} />);

    act(() => {
      setValueRef.current?.('title', 'Some Song');
    });

    expect(screen.getByRole('button', { name: 'Find release date' })).not.toBeDisabled();
  });

  it('shows "Searching…" label and disables button while fetching', () => {
    vi.mocked(useReleaseDateLookupQuery).mockReturnValue({
      isFetching: true,
      error: null,
      data: undefined,
      refetch: mockRefetch,
    });
    const setValueRef = makeSetValueRef();
    render(<Wrapper setValueRef={setValueRef} />);
    const button = screen.getByRole('button', { name: 'Searching…' });
    expect(button).toBeDisabled();
  });

  it('fills the release date and toasts success on a successful lookup', async () => {
    const onSelectDate = vi.fn();
    mockRefetch.mockResolvedValue({
      data: { releasedOn: '2020-06-01', confidence: 'high', sources: ['https://example.com'] },
      error: null,
      status: 'success',
    });

    const setValueRef = makeSetValueRef();
    render(<Wrapper setValueRef={setValueRef} onSelectDate={onSelectDate} />);

    act(() => {
      setValueRef.current?.('title', 'Some Song');
    });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Find release date' }));
    });

    await waitFor(() => {
      expect(onSelectDate).toHaveBeenCalledWith('2020-06-01', 'releasedOn');
    });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('2020-06-01'));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('high'));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('https://example.com'));
  });

  it('toasts "No release date found" when result is null', async () => {
    mockRefetch.mockResolvedValue({
      data: null,
      error: null,
      status: 'success',
    });

    const setValueRef = makeSetValueRef();
    render(<Wrapper setValueRef={setValueRef} />);

    act(() => {
      setValueRef.current?.('title', 'Some Song');
    });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Find release date' }));
    });

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('No release date found');
    });
  });

  it('toasts a destructive error when refetch resolves with an error status', async () => {
    mockRefetch.mockResolvedValue({
      data: undefined,
      error: new Error('Network error'),
      status: 'error',
    });

    const setValueRef = makeSetValueRef();
    render(<Wrapper setValueRef={setValueRef} />);

    act(() => {
      setValueRef.current?.('title', 'Some Song');
    });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Find release date' }));
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Release date lookup failed');
    });
  });

  it('toasts a destructive error when refetch throws', async () => {
    mockRefetch.mockRejectedValue(new Error('Unexpected error'));

    const setValueRef = makeSetValueRef();
    render(<Wrapper setValueRef={setValueRef} />);

    act(() => {
      setValueRef.current?.('title', 'Some Song');
    });

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Find release date' }));
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Release date lookup failed');
    });
  });
});
