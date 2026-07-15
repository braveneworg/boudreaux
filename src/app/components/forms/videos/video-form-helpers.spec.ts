/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type { VideoRow } from '@/lib/validation/video-schema';
import type { ProbePrefillTags } from '@/lib/video-probe/probe-tags';

import {
  applyServerFieldErrors,
  applyServerProbePrefill,
  buildVideoDefaults,
  formatDateForForm,
  mapVideoToFormValues,
  shapePublish,
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

describe('buildVideoDefaults', () => {
  it('defaults the category to MUSIC', () => {
    expect(buildVideoDefaults().category).toBe('MUSIC');
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

// ── applyServerProbePrefill ───────────────────────────────────────────────────

const makeForm = (overrides: Partial<VideoFormData> = {}): UseFormReturn<VideoFormData> => {
  const values: VideoFormData = {
    title: '',
    artist: '',
    description: '',
    releasedOn: '',
    durationSeconds: '',
    s3Key: 'media/videos/v1/clip.mp4',
    fileName: 'clip.mp4',
    fileSize: '4096',
    mimeType: 'video/mp4',
    posterUrl: '',
    publishedAt: '',
    category: 'MUSIC',
    ...overrides,
  };
  return {
    getValues: () => values,
    setValue: vi.fn(),
  } as unknown as UseFormReturn<VideoFormData>;
};

const fullTags: ProbePrefillTags = {
  title: 'Probed Title',
  artist: 'Probed Artist',
  releasedOn: '2023-05-10',
  description: 'A probed description',
  durationSeconds: 245,
};

describe('applyServerProbePrefill', () => {
  it('fills empty title, artist, releasedOn, and description from non-null tags', () => {
    const form = makeForm();
    applyServerProbePrefill(form, fullTags);

    expect(form.setValue).toHaveBeenCalledWith('title', 'Probed Title', {
      shouldDirty: true,
      shouldValidate: true,
    });
    expect(form.setValue).toHaveBeenCalledWith('artist', 'Probed Artist', {
      shouldDirty: true,
      shouldValidate: true,
    });
    expect(form.setValue).toHaveBeenCalledWith('releasedOn', '2023-05-10', {
      shouldDirty: true,
      shouldValidate: true,
    });
    expect(form.setValue).toHaveBeenCalledWith('description', 'A probed description', {
      shouldDirty: true,
      shouldValidate: true,
    });
  });

  it('leaves already-populated fields untouched', () => {
    const form = makeForm({
      title: 'User Title',
      artist: 'User Artist',
      releasedOn: '2020-01-01',
      description: 'User description',
      durationSeconds: '90',
    });
    applyServerProbePrefill(form, fullTags);

    expect(form.setValue).not.toHaveBeenCalledWith('title', expect.anything(), expect.anything());
    expect(form.setValue).not.toHaveBeenCalledWith('artist', expect.anything(), expect.anything());
    expect(form.setValue).not.toHaveBeenCalledWith(
      'releasedOn',
      expect.anything(),
      expect.anything()
    );
    expect(form.setValue).not.toHaveBeenCalledWith(
      'description',
      expect.anything(),
      expect.anything()
    );
    expect(form.setValue).not.toHaveBeenCalledWith(
      'durationSeconds',
      expect.anything(),
      expect.anything()
    );
  });

  it('fills nothing when all tags are null', () => {
    const form = makeForm();
    applyServerProbePrefill(form, {
      title: null,
      artist: null,
      releasedOn: null,
      description: null,
      durationSeconds: null,
    });

    expect(form.setValue).not.toHaveBeenCalled();
  });

  it('fills nothing when string tags are empty strings', () => {
    const form = makeForm();
    // ProbePrefillTags uses string | null; the helper must also guard '' from the type perspective
    // (probe-tags.ts asString already prevents '' — but the helper's guard must be correct too)
    applyServerProbePrefill(form, {
      title: null,
      artist: null,
      releasedOn: null,
      description: null,
      durationSeconds: 120,
    });

    // Only durationSeconds should fire (it is non-null and field is empty)
    expect(form.setValue).toHaveBeenCalledTimes(1);
    expect(form.setValue).toHaveBeenCalledWith('durationSeconds', '120', {
      shouldDirty: true,
      shouldValidate: true,
    });
  });

  it('fills durationSeconds as a string when the field is empty and the tag is non-null', () => {
    const form = makeForm({ durationSeconds: '' });
    applyServerProbePrefill(form, { ...fullTags, durationSeconds: 245 });

    expect(form.setValue).toHaveBeenCalledWith('durationSeconds', '245', {
      shouldDirty: true,
      shouldValidate: true,
    });
  });

  it('does not fill durationSeconds when the field already has a value', () => {
    const form = makeForm({ durationSeconds: '90' });
    applyServerProbePrefill(form, { ...fullTags, durationSeconds: 245 });

    expect(form.setValue).not.toHaveBeenCalledWith(
      'durationSeconds',
      expect.anything(),
      expect.anything()
    );
  });

  it('does not fill durationSeconds when the tag is null', () => {
    const form = makeForm({ durationSeconds: '' });
    applyServerProbePrefill(form, { ...fullTags, durationSeconds: null });

    expect(form.setValue).not.toHaveBeenCalledWith(
      'durationSeconds',
      expect.anything(),
      expect.anything()
    );
  });
});

// ── shapePublish ──────────────────────────────────────────────────────────────

const baseFormData: VideoFormData = {
  title: 'My Video',
  artist: 'An Artist',
  category: 'MUSIC',
  description: '',
  releasedOn: '2026-01-01',
  durationSeconds: '120',
  s3Key: 'media/videos/v1/clip.mp4',
  fileName: 'clip.mp4',
  fileSize: '4096',
  mimeType: 'video/mp4',
  posterUrl: '',
  publishedAt: '',
  producers: [],
};

describe('shapePublish', () => {
  it('Save strips publishedAt on a draft (typed date ignored)', () => {
    expect(
      shapePublish({ ...baseFormData, publishedAt: '2026-09-01' }, 'save', true).publishedAt
    ).toBe('');
  });

  it('Publish stamps today when the date is empty', () => {
    expect(shapePublish({ ...baseFormData, publishedAt: '' }, 'publish', true).publishedAt).toBe(
      formatDateForForm(new Date())
    );
  });

  it('Publish uses the typed date when present', () => {
    expect(
      shapePublish({ ...baseFormData, publishedAt: '2026-09-01' }, 'publish', true).publishedAt
    ).toBe('2026-09-01');
  });

  it('Save persists the date on an already-published video', () => {
    expect(
      shapePublish({ ...baseFormData, publishedAt: '2026-09-01' }, 'save', false).publishedAt
    ).toBe('2026-09-01');
  });

  it('Save on a published video returns data unchanged', () => {
    const data = { ...baseFormData, publishedAt: '2026-09-01' };
    expect(shapePublish(data, 'save', false)).toEqual(data);
  });
});
