/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import type { FeaturedArtistFormData } from '@/lib/validation/create-featured-artist-schema';

import { useFeaturedArtistFormLoad } from './use-featured-artist-form-load';

const useFeaturedArtistQuery = vi.hoisted(() => vi.fn());
vi.mock('../_hooks/use-featured-artist-query', () => ({ useFeaturedArtistQuery }));

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));

const logError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/utils/console-logger', () => ({ error: logError }));

interface TestArtist {
  id: string;
  displayName: string | null;
  firstName: string | null;
  surname: string | null;
}

interface TestRecord {
  displayName: string | null;
  description: string | null;
  coverArt: string | null;
  position: number | null;
  featuredOn: Date | null;
  featuredUntil: Date | null;
  digitalFormatId: string | null;
  releaseId: string | null;
  featuredTrackNumber: number | null;
  artists: TestArtist[];
}

const buildRecord = (overrides: Partial<TestRecord> = {}): TestRecord => ({
  displayName: 'The Band',
  description: 'A great band',
  coverArt: 'cover.jpg',
  position: 3,
  featuredOn: new Date('2026-01-15T00:00:00.000Z'),
  featuredUntil: new Date('2026-02-15T00:00:00.000Z'),
  digitalFormatId: 'fmt-1',
  releaseId: 'rel-1',
  featuredTrackNumber: 2,
  artists: [{ id: 'a1', displayName: 'Artist One', firstName: null, surname: null }],
  ...overrides,
});

interface QueryState {
  data?: TestRecord;
  isPending?: boolean;
  isError?: boolean;
  error?: unknown;
}

const mockQuery = ({
  data,
  isPending = false,
  isError = false,
  error = null,
}: QueryState): void => {
  useFeaturedArtistQuery.mockReturnValue({ data, isPending, isError, error });
};

const setDerivedArtistIds = vi.fn();
const setDerivedArtistNames = vi.fn();
const setFormatStatus = vi.fn();

const renderLoad = (id: string | undefined) =>
  renderHook(() => {
    const form = useForm<FeaturedArtistFormData>();
    const isLoading = useFeaturedArtistFormLoad(id, form, {
      setDerivedArtistIds,
      setDerivedArtistNames,
      setFormatStatus,
    });
    return { form, isLoading };
  });

describe('useFeaturedArtistFormLoad', () => {
  it('returns false in create mode even while the query reports pending', () => {
    mockQuery({ isPending: true });

    const { result } = renderLoad(undefined);

    expect(result.current.isLoading).toBe(false);
  });

  it('disables the query with an empty id in create mode', () => {
    mockQuery({});

    renderLoad(undefined);

    expect(useFeaturedArtistQuery).toHaveBeenCalledWith('', { enabled: false });
  });

  it('enables the query in edit mode', () => {
    mockQuery({ isPending: true });

    renderLoad('fa-1');

    expect(useFeaturedArtistQuery).toHaveBeenCalledWith('fa-1', { enabled: true });
  });

  it('returns true while the query is pending in edit mode', () => {
    mockQuery({ isPending: true });

    const { result } = renderLoad('fa-1');

    expect(result.current.isLoading).toBe(true);
  });

  it('does not reset the form while data is undefined', () => {
    mockQuery({ isPending: true });

    const { result } = renderLoad('fa-1');

    expect(result.current.form.getValues()).toEqual({});
  });

  it('resets the form with the mapped display name when a record loads', async () => {
    mockQuery({ data: buildRecord() });

    const { result } = renderLoad('fa-1');

    await waitFor(() => expect(result.current.form.getValues('displayName')).toBe('The Band'));
  });

  it('formats a valid featured date to an ISO day string', async () => {
    mockQuery({ data: buildRecord() });

    const { result } = renderLoad('fa-1');

    await waitFor(() => expect(result.current.form.getValues('featuredOn')).toBe('2026-01-15'));
  });

  it('marks the format status as found when the record has a digital format', async () => {
    mockQuery({ data: buildRecord({ digitalFormatId: 'fmt-9' }) });

    renderLoad('fa-1');

    await waitFor(() => expect(setFormatStatus).toHaveBeenCalledWith('found'));
  });

  it('leaves the format status untouched when the record has no digital format', async () => {
    mockQuery({ data: buildRecord({ digitalFormatId: null }) });

    renderLoad('fa-1');

    await waitFor(() => expect(setDerivedArtistIds).toHaveBeenCalled());
    expect(setFormatStatus).not.toHaveBeenCalled();
  });

  it('maps a null position to zero', async () => {
    mockQuery({ data: buildRecord({ position: null }) });

    const { result } = renderLoad('fa-1');

    await waitFor(() => expect(result.current.form.getValues('position')).toBe(0));
  });

  it('maps a null display name to an empty string', async () => {
    mockQuery({ data: buildRecord({ displayName: null, artists: [] }) });

    const { result } = renderLoad('fa-1');

    await waitFor(() => expect(result.current.form.getValues('displayName')).toBe(''));
  });

  it('maps a null featured track number to undefined', async () => {
    mockQuery({ data: buildRecord({ featuredTrackNumber: null }) });

    const { result } = renderLoad('fa-1');

    await waitFor(() => expect(setDerivedArtistIds).toHaveBeenCalled());
    expect(result.current.form.getValues('featuredTrackNumber')).toBeUndefined();
  });

  it('maps a null featured date to an empty string', async () => {
    mockQuery({ data: buildRecord({ featuredOn: null }) });

    const { result } = renderLoad('fa-1');

    await waitFor(() => expect(setDerivedArtistIds).toHaveBeenCalled());
    expect(result.current.form.getValues('featuredOn')).toBe('');
  });

  it('formats an invalid featured date to an empty string', async () => {
    mockQuery({ data: buildRecord({ featuredOn: new Date('not-a-date') }) });

    const { result } = renderLoad('fa-1');

    await waitFor(() => expect(setDerivedArtistIds).toHaveBeenCalled());
    expect(result.current.form.getValues('featuredOn')).toBe('');
  });

  it('derives a name from the artist display name when present', async () => {
    mockQuery({
      data: buildRecord({
        artists: [{ id: 'a1', displayName: 'Solo', firstName: 'Ignored', surname: 'Name' }],
      }),
    });

    renderLoad('fa-1');

    await waitFor(() => expect(setDerivedArtistNames).toHaveBeenCalledWith(['Solo']));
  });

  it('derives a name from first and surname when the display name is missing', async () => {
    mockQuery({
      data: buildRecord({
        artists: [{ id: 'a1', displayName: null, firstName: 'Jane', surname: 'Doe' }],
      }),
    });

    renderLoad('fa-1');

    await waitFor(() => expect(setDerivedArtistNames).toHaveBeenCalledWith(['Jane Doe']));
  });

  it('filters out artists with no resolvable name', async () => {
    mockQuery({
      data: buildRecord({
        artists: [
          { id: 'a1', displayName: null, firstName: null, surname: null },
          { id: 'a2', displayName: 'Keep', firstName: null, surname: null },
        ],
      }),
    });

    renderLoad('fa-1');

    await waitFor(() => expect(setDerivedArtistNames).toHaveBeenCalledWith(['Keep']));
  });

  it('derives ids for every artist on the record', async () => {
    mockQuery({
      data: buildRecord({
        artists: [
          { id: 'a1', displayName: 'One', firstName: null, surname: null },
          { id: 'a2', displayName: 'Two', firstName: null, surname: null },
        ],
      }),
    });

    renderLoad('fa-1');

    await waitFor(() => expect(setDerivedArtistIds).toHaveBeenCalledWith(['a1', 'a2']));
  });

  it('logs and toasts when the query errors in edit mode', async () => {
    mockQuery({ isError: true, error: new Error('boom') });

    renderLoad('fa-1');

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Failed to load featured artist data')
    );
  });

  it('does not toast on a query error in create mode', () => {
    mockQuery({ isError: true, error: new Error('boom') });

    renderLoad(undefined);

    expect(toastError).not.toHaveBeenCalled();
  });
});
