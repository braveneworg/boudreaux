/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type { VideoRow } from '@/lib/validation/video-schema';

import {
  applyServerFieldErrors,
  formatDateForForm,
  mapVideoToFormValues,
  validateVideoFile,
} from './video-form-helpers';

import type { UseFormReturn } from 'react-hook-form';

const baseVideo: VideoRow = {
  id: 'v1',
  title: 'Title',
  artist: 'Artist',
  category: 'MUSIC',
  description: 'A description',
  releasedOn: new Date('2024-01-02T00:00:00.000Z'),
  durationSeconds: 90,
  s3Key: 'media/videos/v1/clip.mp4',
  fileName: 'clip.mp4',
  fileSize: 4096n,
  mimeType: 'video/mp4',
  posterUrl: 'https://cdn.example.com/p.jpg',
  publishedAt: new Date('2024-01-03T00:00:00.000Z'),
  archivedAt: null,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

describe('formatDateForForm', () => {
  it('returns an empty string for a null value', () => {
    expect(formatDateForForm(null)).toBe('');
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatDateForForm('not-a-date')).toBe('');
  });

  it('formats a Date to YYYY-MM-DD', () => {
    expect(formatDateForForm(new Date('2024-05-06T12:00:00.000Z'))).toBe('2024-05-06');
  });
});

describe('mapVideoToFormValues', () => {
  it('maps a fully-populated video row', () => {
    expect(mapVideoToFormValues(baseVideo).title).toBe('Title');
  });

  it('coerces a null description to an empty string', () => {
    expect(mapVideoToFormValues({ ...baseVideo, description: null }).description).toBe('');
  });

  it('coerces a null durationSeconds to an empty string', () => {
    expect(mapVideoToFormValues({ ...baseVideo, durationSeconds: null }).durationSeconds).toBe('');
  });

  it('coerces a null fileSize to an empty string', () => {
    expect(mapVideoToFormValues({ ...baseVideo, fileSize: null }).fileSize).toBe('');
  });

  it('stringifies a bigint fileSize', () => {
    expect(mapVideoToFormValues(baseVideo).fileSize).toBe('4096');
  });

  it('coerces a null posterUrl to an empty string', () => {
    expect(mapVideoToFormValues({ ...baseVideo, posterUrl: null }).posterUrl).toBe('');
  });

  it('formats a null publishedAt to an empty string', () => {
    expect(mapVideoToFormValues({ ...baseVideo, publishedAt: null }).publishedAt).toBe('');
  });
});

describe('validateVideoFile', () => {
  it('rejects an unsupported mime type', () => {
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    expect(validateVideoFile(file)).toBe('Only MP4 and WebM videos are supported');
  });

  it('rejects a file over the maximum size', () => {
    const file = new File(['x'], 'a.mp4', { type: 'video/mp4' });
    Object.defineProperty(file, 'size', { value: 6 * 1024 ** 3 });
    expect(validateVideoFile(file)).toContain('exceeds the maximum size');
  });

  it('accepts a valid webm file', () => {
    const file = new File(['x'], 'a.webm', { type: 'video/webm' });
    expect(validateVideoFile(file)).toBeNull();
  });
});

describe('applyServerFieldErrors', () => {
  const makeSetError = () => vi.fn() as unknown as UseFormReturn<VideoFormData>['setError'];

  it('does nothing when there are no errors', () => {
    const setError = makeSetError();
    applyServerFieldErrors(setError, undefined);
    expect(setError).not.toHaveBeenCalled();
  });

  it('skips the general error key', () => {
    const setError = makeSetError();
    applyServerFieldErrors(setError, { general: ['boom'] });
    expect(setError).not.toHaveBeenCalled();
  });

  it('skips fields with an empty message list', () => {
    const setError = makeSetError();
    applyServerFieldErrors(setError, { title: [] });
    expect(setError).not.toHaveBeenCalled();
  });

  it('maps a field error onto the form', () => {
    const setError = makeSetError();
    applyServerFieldErrors(setError, { title: ['Taken'] });
    expect(setError).toHaveBeenCalledWith('title', { type: 'server', message: 'Taken' });
  });
});
