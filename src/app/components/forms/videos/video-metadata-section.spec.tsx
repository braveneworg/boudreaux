/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { act, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import { VideoMetadataSection } from '@/app/components/forms/videos/video-metadata-section';
import { Form } from '@/app/components/ui/form';
import { createVideoSchema } from '@/lib/validation/create-video-schema';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import type { UseFormSetValue } from 'react-hook-form';

vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// Mock: useReleaseDateLookupQuery — idle (not fetching, no data)
// ---------------------------------------------------------------------------
vi.mock('@/app/hooks/use-release-date-lookup-query', () => ({
  useReleaseDateLookupQuery: () => ({
    isFetching: false,
    error: null,
    data: undefined,
    refetch: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Mock: useArtistListQuery — return empty list so comboboxes stay idle
// ---------------------------------------------------------------------------
vi.mock('@/app/hooks/use-artist-list-query', () => ({
  useArtistListQuery: () => ({ data: [], isLoading: false, isPending: false }),
}));

// ---------------------------------------------------------------------------
// Mock: useDebounce — pass-through so debounced search equals input immediately
// ---------------------------------------------------------------------------
vi.mock('@/app/hooks/use-debounce', () => ({
  useDebounce: (value: unknown) => value,
}));

// ---------------------------------------------------------------------------
// Mock: ArtistSearchCombobox — labelled text input; onChange fires on change
// ---------------------------------------------------------------------------
vi.mock('@/app/components/forms/fields/artist-search-combobox', () => ({
  ArtistSearchCombobox: ({
    label,
    value,
    onChange,
    placeholder,
  }: {
    label?: string;
    value: string;
    onChange: (name: string) => void;
    placeholder?: string;
  }) => (
    <div>
      {label && <label htmlFor="artist-search-input">{label}</label>}
      <input
        id="artist-search-input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Mock: FeaturedArtistsCombobox — faithfully reflects disabled prop in DOM so
// VideoMetadataSection's `disabled={primary.trim() === ''}` is verifiable.
// ---------------------------------------------------------------------------
vi.mock('@/app/components/forms/fields/featured-artists-combobox', () => ({
  FeaturedArtistsCombobox: ({
    label,
    disabled,
  }: {
    label?: string;
    value: string[];
    onChange: (names: string[]) => void;
    disabled?: boolean;
  }) => (
    <div>
      {label && <span>{label}</span>}
      <button
        type="button"
        role="combobox"
        aria-label="Search featured artists"
        aria-controls="featured-artists-listbox"
        aria-expanded={false}
        disabled={disabled}
      >
        Search featured artists
      </button>
      {disabled && <p>Add a primary artist first</p>}
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Mock: DatePicker — plain input; onSelect receives the value + fieldName
// ---------------------------------------------------------------------------
vi.mock('@/ui/datepicker', () => ({
  DatePicker: ({
    onSelect,
    fieldName,
    value,
    ...props
  }: {
    onSelect?: (dateString: string, fieldName: string) => void;
    fieldName: string;
    value?: string;
  }) => (
    <input {...props} value={value ?? ''} onChange={(e) => onSelect?.(e.target.value, fieldName)} />
  ),
}));

// ---------------------------------------------------------------------------
// Wrapper — owns a real RHF form and renders VideoMetadataSection.
// Exposes a setValueRef so callers can push values into the RHF store via
// `act(() => setValueRef.current('artist', value))` after mount. This is
// necessary because RHF's `defaultValues` is not propagated to `useWatch`
// until after the first store subscription settles in test environments.
// ---------------------------------------------------------------------------

interface WrapperProps {
  setValueRef: React.MutableRefObject<UseFormSetValue<VideoFormData> | null>;
  omitCategory?: boolean;
}

const Wrapper = ({ setValueRef, omitCategory = false }: WrapperProps): React.ReactElement => {
  const form = useForm<VideoFormData>({
    resolver: zodResolver(createVideoSchema),
    defaultValues: {
      title: '',
      artist: '',
      ...(omitCategory ? {} : { category: 'MUSIC' }),
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
      <VideoMetadataSection
        control={form.control}
        setValue={form.setValue}
        onSelectDate={() => undefined}
      />
    </Form>
  );
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VideoMetadataSection — artist comboboxes', () => {
  it('renders the primary artist combobox with the "Artist / Creator" label', () => {
    const setValueRef = {
      current: null,
    } as React.MutableRefObject<UseFormSetValue<VideoFormData> | null>;
    render(<Wrapper setValueRef={setValueRef} />);

    expect(screen.getByLabelText('Artist / Creator')).toBeInTheDocument();
  });

  it('disables the featured combobox when the artist field is empty', () => {
    const setValueRef = {
      current: null,
    } as React.MutableRefObject<UseFormSetValue<VideoFormData> | null>;
    render(<Wrapper setValueRef={setValueRef} />);

    expect(screen.getByRole('combobox', { name: 'Search featured artists' })).toBeDisabled();
  });

  it('enables the featured combobox when the artist field has a value', () => {
    const setValueRef = {
      current: null,
    } as React.MutableRefObject<UseFormSetValue<VideoFormData> | null>;
    render(<Wrapper setValueRef={setValueRef} />);

    act(() => {
      setValueRef.current?.('artist', 'Some Artist');
    });

    expect(screen.getByRole('combobox', { name: 'Search featured artists' })).not.toBeDisabled();
  });

  it('falls back to an empty category value when the field is undefined', () => {
    const setValueRef = {
      current: null,
    } as React.MutableRefObject<UseFormSetValue<VideoFormData> | null>;
    render(<Wrapper setValueRef={setValueRef} omitCategory />);

    // With no category selected, neither radio option is checked.
    expect(screen.getByLabelText('Music')).not.toBeChecked();
    expect(screen.getByLabelText('Informational')).not.toBeChecked();
  });
});
