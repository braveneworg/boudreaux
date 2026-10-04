/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { deleteArtistBioImageAction } from '@/lib/actions/delete-artist-bio-image-action';
import { deleteArtistBioLinkAction } from '@/lib/actions/delete-artist-bio-link-action';
import { setArtistDisplayImagesAction } from '@/lib/actions/set-artist-display-images-action';
import { updateArtistBioImageAltAction } from '@/lib/actions/update-artist-bio-image-alt-action';
import { updateArtistBioImageAttributionAction } from '@/lib/actions/update-artist-bio-image-attribution-action';
import { queryKeys } from '@/lib/query-keys';
import { HttpError } from '@/lib/utils/fetch-and-parse';
import type {
  BioGenerationStatusResponse,
  BioStatusImage,
  BioStatusLink,
} from '@/lib/validation/bio-generation-schema';

import { BioMediaPalettes } from './bio-media-palettes';
import { uploadBioImage } from './utils/upload-bio-image';

import type { Editor } from '@tiptap/react';

const statusMock = vi.hoisted(() => vi.fn());
const refetchMock = vi.hoisted(() => vi.fn());
/** Controls what `registry.getTarget()` returns for insert tests. */
const mockGetTarget = vi.hoisted(() => vi.fn(() => null as Editor | null));

// The palettes render the real artist pool module over a stubbed status
// read and stubbed Server Actions, so these tests cover the wiring from a
// click to the action the pool runs.
vi.mock('./_hooks/use-artist-bio-generation-status-query', () => ({
  useArtistBioGenerationStatusQuery: (artistId: string) => statusMock(artistId),
}));
vi.mock('./utils/upload-bio-image', () => ({ uploadBioImage: vi.fn() }));
vi.mock('@/lib/actions/set-artist-display-images-action', () => ({
  setArtistDisplayImagesAction: vi.fn(),
}));
vi.mock('@/lib/actions/delete-artist-bio-image-action', () => ({
  deleteArtistBioImageAction: vi.fn(),
}));
vi.mock('@/lib/actions/delete-artist-bio-link-action', () => ({
  deleteArtistBioLinkAction: vi.fn(),
}));
vi.mock('@/lib/actions/create-artist-bio-link-action', () => ({
  createArtistBioLinkAction: vi.fn(),
}));
vi.mock('@/lib/actions/update-artist-bio-image-alt-action', () => ({
  updateArtistBioImageAltAction: vi.fn(),
}));
vi.mock('@/lib/actions/update-artist-bio-image-attribution-action', () => ({
  updateArtistBioImageAttributionAction: vi.fn(),
}));

// The image-sources editor owns its own queries/mutations (covered by its own
// spec); stub it so the wrapper renders without its status query.
vi.mock('./image-source-links-section', () => ({
  ImageSourceLinksSection: () => <div data-testid="image-sources-stub" />,
}));

// The upload zone collects the fields; stub it with a button that hands one
// file to the pool's upload so the wiring can be exercised.
vi.mock('./bio-image-upload-zone', () => ({
  BioImageUploadZone: ({
    onUpload,
  }: {
    onUpload: (file: File, fields: { alt: null; attribution: string }) => Promise<unknown>;
  }) => (
    <button
      type="button"
      onClick={() =>
        void onUpload(new File(['x'], 'new.jpg', { type: 'image/jpeg' }), {
          alt: null,
          attribution: '',
        })
      }
    >
      Simulate upload
    </button>
  ),
}));

vi.mock('@/lib/utils/api-base-url', () => ({
  getApiBaseUrl: () => 'https://fakefourrecords.com',
}));

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

// Expose a controllable registry so insert tests can drive the target editor.
vi.mock('./bio-editor-registry', () => ({
  useBioEditorRegistry: () => ({ getTarget: mockGetTarget }),
}));

// The custom link editor renders the pool too; stub it so these wiring tests
// stay on the palettes.
vi.mock('./custom-link-editor', () => ({
  CustomLinkEditor: ({ artistId }: { artistId: string }) => (
    <div data-testid="custom-link-editor" data-artist-id={artistId} />
  ),
}));

const LINK_ROW: BioStatusLink = {
  id: 'l1',
  label: 'Wikipedia',
  url: 'https://en.wikipedia.org/wiki/X',
  kind: 'wikipedia',
};

const IMAGE_ROW: BioStatusImage = {
  id: 'i1',
  url: 'https://upload.wikimedia.org/a.jpg',
  thumbnailUrl: null,
  title: 'Portrait',
  attribution: 'Wikimedia Commons',
  alt: 'Portrait of the artist',
  isPrimary: true,
  displayOrder: null,
};

const contentWith = (
  links: BioStatusLink[],
  images: BioStatusImage[]
): NonNullable<BioGenerationStatusResponse['content']> => ({
  shortBio: '<p>Short.</p>',
  longBio: '<p>Long.</p>',
  altBio: '<p>Alt.</p>',
  genres: null,
  images,
  links,
  model: 'fake/deterministic',
});

const mockStatus = (data: BioGenerationStatusResponse | undefined, isPending = false): void => {
  statusMock.mockReturnValue({
    data,
    isPending,
    error: Error('Unknown error'),
    refetch: refetchMock,
  });
};

/** A status query that has settled in error with no data (e.g. a 429 that outlived its retries). */
const mockStatusError = (error: Error): void => {
  statusMock.mockReturnValue({
    data: undefined,
    isPending: false,
    error,
    refetch: refetchMock,
  });
};

/** A Server Action stub that never settles, to hold a pool write in flight. */
const neverSettles = () => new Promise<never>(() => {});

const renderPalettes = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // The pool reads the chosen set back from the cache when it writes.
  const status = statusMock('artist-1') as { data?: BioGenerationStatusResponse };
  if (status.data) client.setQueryData(queryKeys.artists.bioGeneration('artist-1'), status.data);
  return render(
    <QueryClientProvider client={client}>
      <BioMediaPalettes artistId="artist-1" />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  refetchMock.mockReset();
  statusMock.mockReset();
  mockStatus({
    status: 'succeeded',
    error: null,
    content: contentWith([LINK_ROW], [IMAGE_ROW]),
  });
  vi.mocked(setArtistDisplayImagesAction).mockResolvedValue({ success: true } as never);
  vi.mocked(deleteArtistBioImageAction).mockResolvedValue({ success: true } as never);
  vi.mocked(deleteArtistBioLinkAction).mockResolvedValue({ success: true } as never);
  vi.mocked(updateArtistBioImageAltAction).mockResolvedValue({ success: true } as never);
  vi.mocked(updateArtistBioImageAttributionAction).mockResolvedValue({ success: true } as never);
});

describe('BioMediaPalettes', () => {
  it('uses xl:grid-cols-1 so palettes stack in the sticky rail', () => {
    const { container } = renderPalettes();
    expect((container.firstChild as HTMLElement).className).toContain('xl:grid-cols-1');
  });

  it('reads the status for the given artist', () => {
    renderPalettes();
    expect(statusMock).toHaveBeenCalledWith('artist-1');
  });

  it('renders the link palette when generated content exists', () => {
    renderPalettes();
    expect(screen.getByRole('group', { name: 'Discovered links' })).toBeInTheDocument();
  });

  it('renders the image manager when generated content exists', () => {
    renderPalettes();
    expect(screen.getByRole('region', { name: 'Bio images' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Image pool' })).toBeInTheDocument();
  });

  // Uploading is the manager's job, so it mounts even before anything exists.
  it('mounts the manager with an empty pool when the artist has no generated content', () => {
    mockStatus({ status: null, error: null, content: null });
    renderPalettes();
    expect(screen.getByRole('region', { name: 'Bio images' })).toBeInTheDocument();
    expect(screen.getByText(/No images yet/)).toBeInTheDocument();
  });

  // Adding a custom link is the link palette's job too, so its editor mounts
  // even before the artist has a single link.
  it('mounts the link palette and its custom-link editor when the artist has no links', () => {
    mockStatus({ status: null, error: null, content: null });
    renderPalettes();
    expect(screen.getByTestId('custom-link-editor')).toHaveAttribute('data-artist-id', 'artist-1');
  });

  it('mounts the manager with an empty pool while a generation job is still processing', () => {
    mockStatus({ status: 'processing', error: null, content: null });
    renderPalettes();
    expect(screen.getByRole('region', { name: 'Bio images' })).toBeInTheDocument();
    expect(screen.getByText(/No images yet/)).toBeInTheDocument();
  });

  it('shows the manager loading state before the status query resolves', () => {
    mockStatus(undefined, true);
    renderPalettes();
    expect(screen.getByRole('status')).toHaveTextContent('Loading images');
  });

  it('shows no load failure while the status query is still loading', () => {
    mockStatus(undefined, true);
    renderPalettes();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // The status read is the manager's only data source; a throttled read must
  // surface as a failure, never as an empty pool (nginx 429, 2026-09-21).
  it('explains a throttled status read as rate limiting', () => {
    mockStatusError(new HttpError('Failed to fetch bio generation status', 429));
    renderPalettes();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load the image pool — the server is rate limiting requests, try again in a moment."
    );
  });

  it('shows the error message when the status read failed for another reason', () => {
    mockStatusError(new HttpError('Failed to fetch bio generation status', 500));
    renderPalettes();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load the image pool — Failed to fetch bio generation status."
    );
  });

  it('hides the empty-pool copy when the status read failed', () => {
    mockStatusError(new HttpError('Failed to fetch bio generation status', 429));
    renderPalettes();
    expect(screen.queryByText(/No images yet/)).not.toBeInTheDocument();
  });

  it('refetches the status when Retry is pressed on the load failure', async () => {
    mockStatusError(new HttpError('Failed to fetch bio generation status', 429));
    renderPalettes();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows an empty pool when the artist has links but no images', () => {
    mockStatus({ status: 'succeeded', error: null, content: contentWith([LINK_ROW], []) });
    renderPalettes();
    expect(screen.getByRole('group', { name: 'Discovered links' })).toBeInTheDocument();
    expect(screen.getByText(/No images yet/)).toBeInTheDocument();
  });

  it('routes "use as display image" through the set action', async () => {
    renderPalettes();
    await userEvent.click(screen.getByRole('button', { name: 'Use Portrait as display image' }));
    await waitFor(() =>
      expect(setArtistDisplayImagesAction).toHaveBeenCalledWith({
        artistId: 'artist-1',
        imageIds: [IMAGE_ROW.id],
      })
    );
  });

  it('routes an alt text edit through the alt action', async () => {
    renderPalettes();
    await userEvent.click(screen.getByRole('button', { name: 'Edit alt text for Portrait' }));
    const input = screen.getByRole('textbox', { name: 'Alt text' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Portrait of X');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() =>
      expect(updateArtistBioImageAltAction).toHaveBeenCalledWith({
        imageId: IMAGE_ROW.id,
        alt: 'Portrait of X',
      })
    );
  });

  it('hands an upload to the pool, which runs the pipeline for the artist', async () => {
    vi.mocked(uploadBioImage).mockResolvedValueOnce({ success: false, error: 'S3 refused' });
    renderPalettes();
    await userEvent.click(screen.getByRole('button', { name: 'Simulate upload' }));
    await waitFor(() =>
      expect(uploadBioImage).toHaveBeenCalledWith(expect.any(File), {
        artistId: 'artist-1',
        alt: null,
        attribution: '',
      })
    );
  });

  it('disables the manager while a display-image write is pending', async () => {
    vi.mocked(setArtistDisplayImagesAction).mockImplementationOnce(neverSettles);
    renderPalettes();
    await userEvent.click(screen.getByRole('button', { name: 'Use Portrait as display image' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete image Portrait' })).toBeDisabled()
    );
  });

  it('routes a link delete through the action', async () => {
    renderPalettes();
    await userEvent.click(screen.getByRole('button', { name: `Delete link ${LINK_ROW.label}` }));
    await waitFor(() => expect(deleteArtistBioLinkAction).toHaveBeenCalledWith(LINK_ROW.id));
  });

  it('routes an image delete through the action', async () => {
    renderPalettes();
    await userEvent.click(screen.getByRole('button', { name: 'Delete image Portrait' }));
    await waitFor(() => expect(deleteArtistBioImageAction).toHaveBeenCalledWith(IMAGE_ROW.id));
  });

  it('disables image deletes while a link delete is pending', async () => {
    vi.mocked(deleteArtistBioLinkAction).mockImplementationOnce(neverSettles);
    renderPalettes();
    await userEvent.click(screen.getByRole('button', { name: 'Delete link Wikipedia' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete image Portrait' })).toBeDisabled()
    );
  });

  it('disables link deletes while an image delete is pending', async () => {
    vi.mocked(deleteArtistBioImageAction).mockImplementationOnce(neverSettles);
    renderPalettes();
    await userEvent.click(screen.getByRole('button', { name: 'Delete image Portrait' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete link Wikipedia' })).toBeDisabled()
    );
  });

  // The old manager left the pool live during an upload, so a choice made
  // then was overwritten when the upload landed; an upload now counts as a
  // pool write like any other.
  it('disables palette controls while an upload is in flight', async () => {
    vi.mocked(uploadBioImage).mockImplementationOnce(neverSettles);
    renderPalettes();
    await userEvent.click(screen.getByRole('button', { name: 'Simulate upload' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Insert image Portrait' })).toBeDisabled()
    );
  });

  // ── insertLink ──────────────────────────────────────────────────────────────

  it('insertLink explains itself instead of silently doing nothing when no editor is focused', async () => {
    mockGetTarget.mockReturnValue(null);
    renderPalettes();
    await userEvent.click(screen.getByRole('button', { name: 'Insert link Wikipedia' }));
    expect(mockGetTarget).toHaveBeenCalled();
    expect(vi.mocked(toast.info)).toHaveBeenCalledWith(
      'Click into a bio editor first, then insert.'
    );
  });

  it('insertLink calls chain().focus().insertContent(bioLink).run() on the target editor', async () => {
    const run = vi.fn();
    const chain = { focus: vi.fn().mockReturnThis(), insertContent: vi.fn().mockReturnThis(), run };
    const fakeEditor = { chain: vi.fn().mockReturnValue(chain) } as unknown as Editor;
    mockGetTarget.mockReturnValue(fakeEditor);
    renderPalettes();
    await userEvent.click(screen.getByRole('button', { name: 'Insert link Wikipedia' }));
    expect(chain.insertContent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'bioLink',
        attrs: expect.objectContaining({
          href: LINK_ROW.url,
          text: LINK_ROW.label,
        }),
      })
    );
    expect(run).toHaveBeenCalled();
  });

  // ── insertImage ─────────────────────────────────────────────────────────────

  it('insertImage explains itself instead of silently doing nothing when no editor is focused', async () => {
    mockGetTarget.mockReturnValue(null);
    renderPalettes();
    await userEvent.click(screen.getByRole('button', { name: 'Insert image Portrait' }));
    expect(mockGetTarget).toHaveBeenCalled();
    expect(vi.mocked(toast.info)).toHaveBeenCalledWith(
      'Click into a bio editor first, then insert.'
    );
  });

  it('insertImage calls chain().focus().insertContent(bioFigure).run() on the target editor', async () => {
    const run = vi.fn();
    const chain = { focus: vi.fn().mockReturnThis(), insertContent: vi.fn().mockReturnThis(), run };
    const fakeEditor = { chain: vi.fn().mockReturnValue(chain) } as unknown as Editor;
    mockGetTarget.mockReturnValue(fakeEditor);
    renderPalettes();
    await userEvent.click(screen.getByRole('button', { name: 'Insert image Portrait' }));
    expect(chain.insertContent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'bioFigure' })
    );
    expect(run).toHaveBeenCalled();
  });

  it('insertImage falls back to title as alt when image.alt is absent', async () => {
    const run = vi.fn();
    const chain = { focus: vi.fn().mockReturnThis(), insertContent: vi.fn().mockReturnThis(), run };
    const fakeEditor = { chain: vi.fn().mockReturnValue(chain) } as unknown as Editor;
    mockGetTarget.mockReturnValue(fakeEditor);
    const imageNoAlt: BioStatusImage = {
      id: 'i2',
      url: 'https://upload.wikimedia.org/b.jpg',
      thumbnailUrl: null,
      title: 'Fallback Title',
      attribution: null,
      isPrimary: false,
      displayOrder: null,
    };
    mockStatus({
      status: 'succeeded',
      error: null,
      content: contentWith([LINK_ROW], [imageNoAlt]),
    });
    renderPalettes();
    await userEvent.click(screen.getByRole('button', { name: 'Insert image Fallback Title' }));
    // alt derived from title when image.alt is absent
    expect(chain.insertContent).toHaveBeenCalledWith(
      expect.objectContaining({ attrs: expect.objectContaining({ alt: 'Fallback Title' }) })
    );
  });

  it('renders the pool when persisted content exists without a succeeded job', () => {
    mockStatus({ status: null, error: null, content: contentWith([LINK_ROW], [IMAGE_ROW]) });
    renderPalettes();
    expect(screen.getByRole('group', { name: 'Image pool' })).toBeInTheDocument();
  });

  it('routes an image attribution edit through the action', async () => {
    renderPalettes();
    await userEvent.click(
      screen.getByRole('button', { name: `Edit attribution for ${IMAGE_ROW.title}` })
    );
    const input = screen.getByRole('textbox', { name: /attribution/i });
    await userEvent.clear(input);
    await userEvent.type(input, 'New credit');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() =>
      expect(updateArtistBioImageAttributionAction).toHaveBeenCalledWith({
        imageId: IMAGE_ROW.id,
        attribution: 'New credit',
      })
    );
  });

  it('insertImage falls back to "Artist photo" when both alt and title are absent', async () => {
    const run = vi.fn();
    const chain = { focus: vi.fn().mockReturnThis(), insertContent: vi.fn().mockReturnThis(), run };
    const fakeEditor = { chain: vi.fn().mockReturnValue(chain) } as unknown as Editor;
    mockGetTarget.mockReturnValue(fakeEditor);
    const imageNoAltNoTitle: BioStatusImage = {
      id: 'i3',
      url: 'https://upload.wikimedia.org/c.jpg',
      thumbnailUrl: null,
      title: null,
      attribution: null,
      isPrimary: false,
      displayOrder: null,
    };
    mockStatus({
      status: 'succeeded',
      error: null,
      content: contentWith([LINK_ROW], [imageNoAltNoTitle]),
    });
    renderPalettes();
    // Image with no title renders with 'image' as previewLabel → button name 'Insert image image'
    await userEvent.click(screen.getByRole('button', { name: 'Insert image image' }));
    expect(chain.insertContent).toHaveBeenCalledWith(
      expect.objectContaining({ attrs: expect.objectContaining({ alt: 'Artist photo' }) })
    );
  });
});
