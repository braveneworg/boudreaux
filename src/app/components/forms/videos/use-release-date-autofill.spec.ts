// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { shouldLookupReleaseDate, useReleaseDateAutoFill } from './use-release-date-autofill';
import { useReleaseDateLookupQuery } from '../_hooks/use-release-date-lookup-query';

vi.mock('server-only', () => ({}));
vi.mock('../_hooks/use-release-date-lookup-query', () => ({
  useReleaseDateLookupQuery: vi.fn(),
}));

const mockLookup = (data: { releasedOn: string } | null): void => {
  vi.mocked(useReleaseDateLookupQuery).mockReturnValue({
    isFetching: false,
    error: Error('none'),
    data,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useReleaseDateLookupQuery>);
};

beforeEach(() => {
  mockLookup(null);
});

describe('shouldLookupReleaseDate', () => {
  const base = { uploadStatus: 'success', title: 'My Bad', releasedOn: '' };

  it('looks up once the upload succeeded and a title is known', () => {
    expect(shouldLookupReleaseDate(base)).toBe(true);
  });

  it('does not look up while the upload is still in flight', () => {
    expect(shouldLookupReleaseDate({ ...base, uploadStatus: 'uploading' })).toBe(false);
  });

  it('does not look up before any file has been uploaded', () => {
    expect(shouldLookupReleaseDate({ ...base, uploadStatus: 'idle' })).toBe(false);
  });

  it('does not look up without a title to search on', () => {
    expect(shouldLookupReleaseDate({ ...base, title: '' })).toBe(false);
  });

  it('treats a whitespace-only title as no title', () => {
    expect(shouldLookupReleaseDate({ ...base, title: '   ' })).toBe(false);
  });

  it('does not look up when a release date is already set', () => {
    expect(shouldLookupReleaseDate({ ...base, releasedOn: '2019-08-04' })).toBe(false);
  });

  it('tolerates an undefined title', () => {
    expect(shouldLookupReleaseDate({ ...base, title: undefined })).toBe(false);
  });
});

interface RenderArgs {
  uploadStatus?: string;
  releasedOn?: string;
}

const renderAutoFill = ({ uploadStatus = 'success', releasedOn = '' }: RenderArgs = {}) => {
  const { result } = renderHook(() => {
    const form = useForm<VideoFormData>({
      defaultValues: { title: 'My Bad', artist: 'Ceschi', releasedOn },
    });
    useReleaseDateAutoFill({ uploadStatus, form });
    return { form };
  });
  return result;
};

describe('useReleaseDateAutoFill', () => {
  it('fills the release date when the lookup finds one', async () => {
    mockLookup({ releasedOn: '2019-08-04' });
    const result = renderAutoFill();

    await act(async () => {});

    expect(result.current.form.getValues('releasedOn')).toBe('2019-08-04');
  });

  it('leaves the field empty when the lookup finds nothing', async () => {
    mockLookup(null);
    const result = renderAutoFill();

    await act(async () => {});

    expect(result.current.form.getValues('releasedOn')).toBe('');
  });

  it('never clobbers a release date the admin already set', async () => {
    mockLookup({ releasedOn: '2019-08-04' });
    const result = renderAutoFill({ releasedOn: '2001-01-01' });

    await act(async () => {});

    expect(result.current.form.getValues('releasedOn')).toBe('2001-01-01');
  });
});
