/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';

import { ReleaseForm } from '@/app/components/forms/release-form';
import { type ReleaseDetail, useReleaseDetailQuery } from '@/hooks/use-release-query';

/**
 * Regression coverage for the edit-mode digital-formats checkmarks.
 *
 * Unlike `release-form.spec.tsx`, this suite renders the REAL
 * `DigitalFormatsAccordion` (it is not mocked here). The accordion seeds its
 * "already uploaded" state from `existingFormats` via `useState` initializers
 * that run once, at mount. So the form must hand it the loaded formats on the
 * same render the accordion first mounts — if the loaded data is projected one
 * render late, the accordion mounts empty and the checkmarks never appear. This
 * is the exact failure the admin-digital-formats E2E specs caught.
 */
const render = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'QueryClientTestWrapper';
  return rtlRender(ui, { wrapper: Wrapper });
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/releases/rel-1',
}));

vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1', name: 'Admin', role: 'admin' } },
    status: 'authenticated',
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Mutation/server actions the form and accordion reference but never invoke here.
vi.mock('@/lib/actions/create-release-action', () => ({ createReleaseAction: vi.fn() }));
vi.mock('@/lib/actions/update-release-action', () => ({ updateReleaseAction: vi.fn() }));
vi.mock('@/lib/actions/presigned-upload-actions', () => ({
  getPresignedUploadUrlsAction: vi.fn(),
}));
vi.mock('@/lib/actions/register-image-actions', () => ({ registerReleaseImagesAction: vi.fn() }));
vi.mock('@/lib/actions/release-image-actions', () => ({
  deleteReleaseImageAction: vi.fn(),
  reorderReleaseImagesAction: vi.fn(),
}));
vi.mock('@/lib/actions/confirm-upload-action', () => ({
  confirmDigitalFormatUploadAction: vi.fn(),
  confirmMultiTrackUploadAction: vi.fn(),
}));
vi.mock('@/lib/actions/delete-format-files-action', () => ({ deleteFormatFilesAction: vi.fn() }));
vi.mock('@/lib/actions/find-or-create-release-action', () => ({
  findOrCreateReleaseAction: vi.fn(),
}));
vi.mock('@/lib/utils/direct-upload', () => ({ uploadFilesToS3: vi.fn() }));
vi.mock('@/lib/utils/console-logger', () => ({ error: vi.fn() }));

// Keep unrelated heavy fields out of the render — the accordion is the subject.
vi.mock('@/app/components/forms/fields/artist-multi-select', () => ({
  ArtistMultiSelect: () => <div data-testid="artist-multi-select" />,
}));
vi.mock('@/app/components/forms/fields/cover-art-field', () => ({
  CoverArtField: () => <div data-testid="cover-art-field" />,
}));
vi.mock('@/app/components/ui/image-uploader', () => ({
  ImageUploader: () => <div data-testid="image-uploader" />,
}));

vi.mock('@/hooks/use-release-query', () => ({
  useReleaseDetailQuery: vi.fn(),
}));

const releaseWithMp3: ReleaseDetail = {
  id: 'rel-1',
  title: 'My Release',
  labels: [],
  releasedOn: new Date('2024-01-01T00:00:00.000Z'),
  catalogNumber: null,
  coverArt: 'https://cdn.example.com/cover.jpg',
  description: null,
  downloadUrls: [],
  formats: ['DIGITAL'],
  extendedData: [],
  notes: [],
  executiveProducedBy: [],
  coProducedBy: [],
  masteredBy: [],
  mixedBy: [],
  recordedBy: [],
  artBy: [],
  designBy: [],
  photographyBy: [],
  linerNotesBy: [],
  imageTypes: [],
  variants: [],
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  deletedOn: null,
  publishedAt: null,
  featuredOn: null,
  featuredUntil: null,
  featuredDescription: null,
  tagId: null,
  suggestedPrice: null,
  images: [],
  artistReleases: [],
  digitalFormats: [
    {
      id: 'df-1',
      releaseId: 'rel-1',
      formatType: 'MP3_320KBPS',
      s3Key: null,
      fileName: null,
      fileSize: null,
      mimeType: null,
      trackCount: 1,
      totalFileSize: 5_000_000n,
      checksum: null,
      deletedAt: null,
      uploadedAt: new Date('2024-01-01T00:00:00.000Z'),
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      files: [
        {
          id: 'file-1',
          formatId: 'df-1',
          trackNumber: 1,
          title: 'Track One',
          duration: 180,
          s3Key: 'releases/rel-1/audio/mp3_320kbps/01-track.mp3',
          fileName: '01-track.mp3',
          fileSize: 5_000_000n,
          mimeType: 'audio/mpeg',
          checksum: null,
          uploadedAt: new Date('2024-01-01T00:00:00.000Z'),
          createdAt: new Date('2024-01-01T00:00:00.000Z'),
          updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        },
      ],
    },
  ],
  releaseUrls: [],
};

describe('ReleaseForm — existing digital formats', () => {
  it('marks a seeded format as uploaded once the release query resolves', async () => {
    vi.mocked(useReleaseDetailQuery).mockReturnValue({
      data: releaseWithMp3,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<ReleaseForm releaseId="rel-1" />);

    await waitFor(() => {
      expect(screen.getByTestId('format-uploaded-checkmark')).toBeInTheDocument();
    });
  });
});
