// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { renderHook } from '@testing-library/react';
import { useForm } from 'react-hook-form';

import type { VideoFormData } from '@/lib/validation/create-video-schema';
import type { VideoRow } from '@/lib/validation/video-schema';

import { useDescriptionAutoGenerate } from './use-description-auto-generate';
import { useReleaseDateAutoLookup } from './use-release-date-auto-lookup';
import { useReleaseDateAutosave } from './use-release-date-autosave';
import { useVideoAutoFill, type UseVideoAutoFillArgs } from './use-video-auto-fill';

vi.mock('server-only', () => ({}));
vi.mock('./use-release-date-auto-lookup', () => ({
  useReleaseDateAutoLookup: vi.fn(() => ({ status: 'idle', resolvedKey: null })),
}));
vi.mock('./use-release-date-autosave', () => ({ useReleaseDateAutosave: vi.fn() }));
vi.mock('./use-description-auto-generate', () => ({ useDescriptionAutoGenerate: vi.fn() }));

const row = (releasedOn: Date | null): VideoRow =>
  ({
    id: 'v1',
    title: 'Title',
    artist: 'Artist',
    category: 'MUSIC',
    description: null,
    releasedOn,
    durationSeconds: null,
    s3Key: 'media/videos/v1/clip.mp4',
    fileName: 'clip.mp4',
    fileSize: null,
    mimeType: 'video/mp4',
    posterUrl: null,
    publishedAt: null,
    archivedAt: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  }) as VideoRow;

const renderAutoFill = (overrides: Partial<Omit<UseVideoAutoFillArgs, 'form'>> = {}) =>
  renderHook(() => {
    const form = useForm<VideoFormData>();
    return useVideoAutoFill({
      form,
      uploadStatus: 'idle',
      video: undefined,
      isEditMode: false,
      effectiveVideoId: undefined,
      category: 'MUSIC',
      ...overrides,
    });
  });

const lookupArgs = () => vi.mocked(useReleaseDateAutoLookup).mock.calls.at(-1)?.[0];
const autosaveArgs = () => vi.mocked(useReleaseDateAutosave).mock.calls.at(-1)?.[0];
const describeArgs = () => vi.mocked(useDescriptionAutoGenerate).mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.mocked(useReleaseDateAutoLookup).mockReturnValue({ status: 'idle', resolvedKey: null });
});

describe('useVideoAutoFill — lookup args', () => {
  it('reports no persisted row in create mode before the draft exists', () => {
    renderAutoFill();

    expect(lookupArgs()).toMatchObject({ hasPersistedRow: false });
  });

  it('reports a persisted row in create mode once the draft id exists', () => {
    renderAutoFill({ effectiveVideoId: 'draft-1' });

    expect(lookupArgs()).toMatchObject({ hasPersistedRow: true });
  });

  it('reports no persisted row in edit mode until the video has loaded', () => {
    renderAutoFill({ isEditMode: true, effectiveVideoId: 'v1', video: undefined });

    expect(lookupArgs()).toMatchObject({ hasPersistedRow: false });
  });

  it('reports a persisted row in edit mode once the video has loaded', () => {
    renderAutoFill({ isEditMode: true, effectiveVideoId: 'v1', video: row(null) });

    expect(lookupArgs()).toMatchObject({ hasPersistedRow: true });
  });

  it('forwards the upload status and category', () => {
    renderAutoFill({ uploadStatus: 'uploading', category: 'INFORMATIONAL' });

    expect(lookupArgs()).toMatchObject({ uploadStatus: 'uploading', category: 'INFORMATIONAL' });
  });
});

describe('useVideoAutoFill — autosave args', () => {
  it('passes the effective row id', () => {
    renderAutoFill({ effectiveVideoId: 'draft-1' });

    expect(autosaveArgs()).toMatchObject({ videoId: 'draft-1' });
  });

  it('seeds the persisted day from the loaded row', () => {
    renderAutoFill({
      isEditMode: true,
      effectiveVideoId: 'v1',
      video: row(new Date('2020-06-01T00:00:00.000Z')),
    });

    expect(autosaveArgs()).toMatchObject({ persistedReleasedOn: '2020-06-01' });
  });

  it('seeds an empty persisted day for a dateless row', () => {
    renderAutoFill({ isEditMode: true, effectiveVideoId: 'v1', video: row(null) });

    expect(autosaveArgs()).toMatchObject({ persistedReleasedOn: '' });
  });

  it('seeds an empty persisted day when no row has loaded', () => {
    renderAutoFill();

    expect(autosaveArgs()).toMatchObject({ persistedReleasedOn: '' });
  });
});

describe('useVideoAutoFill — description and status', () => {
  it('hands the resolved lookup key to the description auto-generate', () => {
    vi.mocked(useReleaseDateAutoLookup).mockReturnValue({
      status: 'found',
      resolvedKey: 'my bad ceschi',
    });

    renderAutoFill();

    expect(describeArgs()).toMatchObject({ lookupResolvedKey: 'my bad ceschi' });
  });

  it('returns the lookup status for the field hint', () => {
    vi.mocked(useReleaseDateAutoLookup).mockReturnValue({ status: 'exhausted', resolvedKey: 'k' });

    const { result } = renderAutoFill();

    expect(result.current.releaseDateLookupStatus).toBe('exhausted');
  });
});
