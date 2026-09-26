/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

import { HttpError } from '@/lib/utils/fetch-and-parse';
import type {
  BioGenerationStatusResponse,
  BioStatusImage,
  BioStatusLink,
} from '@/lib/validation/bio-generation-schema';

import { BioMediaPalettes } from './bio-media-palettes';

import type { Editor } from '@tiptap/react';

const statusMock = vi.hoisted(() => vi.fn());
const refetchMock = vi.hoisted(() => vi.fn());
const deleteBioLink = vi.hoisted(() => vi.fn());
const deleteBioImage = vi.hoisted(() => vi.fn());
const updateBioImageAttribution = vi.hoisted(() => vi.fn());
const updateBioImageAlt = vi.hoisted(() => vi.fn());
const setDisplayImages = vi.hoisted(() => vi.fn());
const pending = vi.hoisted(() => ({
  link: false,
  image: false,
  updating: false,
  alt: false,
  setting: false,
}));
/** Controls what `registry.getTarget()` returns for insert tests. */
const mockGetTarget = vi.hoisted(() => vi.fn(() => null as Editor | null));

vi.mock('./_hooks/use-artist-bio-generation-status-query', () => ({
  useArtistBioGenerationStatusQuery: (artistId: string) => statusMock(artistId),
}));

vi.mock('./_hooks/mutations/use-bio-media-mutations', () => ({
  useDeleteBioLinkMutation: () => ({ deleteBioLink, isDeletingBioLink: pending.link }),
  useDeleteBioImageMutation: () => ({ deleteBioImage, isDeletingBioImage: pending.image }),
  useUpdateBioImageAttributionMutation: () => ({
    updateBioImageAttribution,
    isUpdatingBioImageAttribution: pending.updating,
  }),
  useUpdateBioImageAltMutation: () => ({
    updateBioImageAlt,
    isUpdatingBioImageAlt: pending.alt,
  }),
  useSetDisplayImagesMutation: () => ({
    setDisplayImages,
    isSettingDisplayImages: pending.setting,
  }),
}));

// The image-sources editor owns its own queries/mutations (covered by its own
// spec); stub it so the wrapper renders without a QueryClient.
vi.mock('./image-source-links-section', () => ({
  ImageSourceLinksSection: () => <div data-testid="image-sources-stub" />,
}));

// The upload zone owns the presign pipeline; stub it with a button that
// reports a row so the wrapper's refetch wiring can be exercised.
vi.mock('./bio-image-upload-zone', () => ({
  BioImageUploadZone: ({ onUploaded }: { onUploaded: (image: { id: string }) => void }) => (
    <button type="button" onClick={() => onUploaded({ id: 'new' })}>
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

// The custom link editor owns its own create mutation; stub it here so these
// wiring tests stay focused on the palettes and never touch TanStack Query.
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

beforeEach(() => {
  pending.link = false;
  pending.image = false;
  pending.updating = false;
  pending.alt = false;
  pending.setting = false;
  refetchMock.mockReset();
  mockStatus({
    status: 'succeeded',
    error: null,
    content: contentWith([LINK_ROW], [IMAGE_ROW]),
  });
});

describe('BioMediaPalettes', () => {
  it('uses xl:grid-cols-1 so palettes stack in the sticky rail', () => {
    const { container } = render(<BioMediaPalettes artistId="artist-1" />);

    expect((container.firstChild as HTMLElement).className).toContain('xl:grid-cols-1');
  });

  it('reads the status for the given artist', () => {
    render(<BioMediaPalettes artistId="artist-1" />);

    expect(statusMock).toHaveBeenCalledWith('artist-1');
  });

  it('renders the link palette when generated content exists', () => {
    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('group', { name: 'Discovered links' })).toBeInTheDocument();
  });

  it('renders the image manager when generated content exists', () => {
    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('region', { name: 'Bio images' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Image pool' })).toBeInTheDocument();
  });

  // Uploading is the manager's job, so it mounts even before anything exists.
  it('mounts the manager with an empty pool when the artist has no generated content', () => {
    mockStatus({ status: null, error: null, content: null });

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('region', { name: 'Bio images' })).toBeInTheDocument();
    expect(screen.getByText(/No images yet/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Discovered links' })).not.toBeInTheDocument();
  });

  it('mounts the manager with an empty pool while a generation job is still processing', () => {
    mockStatus({ status: 'processing', error: null, content: null });

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('region', { name: 'Bio images' })).toBeInTheDocument();
    expect(screen.getByText(/No images yet/)).toBeInTheDocument();
  });

  it('shows the manager loading state before the status query resolves', () => {
    mockStatus(undefined, true);

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading images');
  });

  it('shows no load failure while the status query is still loading', () => {
    mockStatus(undefined, true);

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // The status read is the manager's only data source; a throttled read must
  // surface as a failure, never as an empty pool (nginx 429, 2026-09-21).
  it('explains a throttled status read as rate limiting', () => {
    mockStatusError(new HttpError('Failed to fetch bio generation status', 429));

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load the image pool — the server is rate limiting requests, try again in a moment."
    );
  });

  it('shows the error message when the status read failed for another reason', () => {
    mockStatusError(new HttpError('Failed to fetch bio generation status', 500));

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load the image pool — Failed to fetch bio generation status."
    );
  });

  it('hides the empty-pool copy when the status read failed', () => {
    mockStatusError(new HttpError('Failed to fetch bio generation status', 429));

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.queryByText(/No images yet/)).not.toBeInTheDocument();
  });

  it('refetches the status when Retry is pressed on the load failure', async () => {
    mockStatusError(new HttpError('Failed to fetch bio generation status', 429));

    render(<BioMediaPalettes artistId="artist-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('mounts the manager with an empty pool when the content has no links and no images', () => {
    mockStatus({ status: 'succeeded', error: null, content: contentWith([], []) });

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('region', { name: 'Bio images' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Discovered links' })).not.toBeInTheDocument();
  });

  it('omits the link palette when there are no links', () => {
    mockStatus({ status: 'succeeded', error: null, content: contentWith([], [IMAGE_ROW]) });

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.queryByRole('group', { name: 'Discovered links' })).not.toBeInTheDocument();
  });

  it('shows an empty pool when the artist has links but no images', () => {
    mockStatus({ status: 'succeeded', error: null, content: contentWith([LINK_ROW], []) });

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('group', { name: 'Discovered links' })).toBeInTheDocument();
    expect(screen.getByText(/No images yet/)).toBeInTheDocument();
  });

  it('routes "use as display image" through the set mutation', async () => {
    render(<BioMediaPalettes artistId="artist-1" />);

    await userEvent.click(screen.getByRole('button', { name: 'Use Portrait as display image' }));

    expect(setDisplayImages).toHaveBeenCalledWith([IMAGE_ROW.id]);
  });

  it('routes an alt text edit through the alt mutation', async () => {
    render(<BioMediaPalettes artistId="artist-1" />);

    await userEvent.click(screen.getByRole('button', { name: 'Edit alt text for Portrait' }));
    const input = screen.getByRole('textbox', { name: 'Alt text' });
    await userEvent.clear(input);
    await userEvent.type(input, 'Portrait of X');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(updateBioImageAlt).toHaveBeenCalledWith({ imageId: IMAGE_ROW.id, alt: 'Portrait of X' });
  });

  it('refetches the status after an upload so the new row joins the pool', async () => {
    render(<BioMediaPalettes artistId="artist-1" />);

    await userEvent.click(screen.getByRole('button', { name: 'Simulate upload' }));

    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('disables the manager while a display-image write is pending', () => {
    pending.setting = true;

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('button', { name: 'Delete image Portrait' })).toBeDisabled();
  });

  it('routes a link delete through the mutation', async () => {
    render(<BioMediaPalettes artistId="artist-1" />);

    await userEvent.click(screen.getByRole('button', { name: `Delete link ${LINK_ROW.label}` }));

    expect(deleteBioLink).toHaveBeenCalledWith(LINK_ROW.id);
  });

  it('routes an image delete through the mutation', async () => {
    render(<BioMediaPalettes artistId="artist-1" />);

    await userEvent.click(screen.getByRole('button', { name: 'Delete image Portrait' }));

    expect(deleteBioImage).toHaveBeenCalledWith(IMAGE_ROW.id);
  });

  it('disables image deletes while a link delete is pending', () => {
    pending.link = true;

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('button', { name: 'Delete image Portrait' })).toBeDisabled();
  });

  it('disables link deletes while an image delete is pending', () => {
    pending.image = true;

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('button', { name: 'Delete link Wikipedia' })).toBeDisabled();
  });

  it('disables palette controls while an attribution update is pending', () => {
    pending.updating = true;

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('button', { name: 'Insert image Portrait' })).toBeDisabled();
  });

  // ── insertLink ──────────────────────────────────────────────────────────────

  it('insertLink explains itself instead of silently doing nothing when no editor is focused', async () => {
    mockGetTarget.mockReturnValue(null);
    render(<BioMediaPalettes artistId="artist-1" />);

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

    render(<BioMediaPalettes artistId="artist-1" />);
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
    render(<BioMediaPalettes artistId="artist-1" />);

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

    render(<BioMediaPalettes artistId="artist-1" />);
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
    statusMock.mockReturnValue({
      data: {
        status: 'succeeded',
        error: null,
        content: contentWith([LINK_ROW], [imageNoAlt]),
      },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<BioMediaPalettes artistId="artist-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Insert image Fallback Title' }));

    // alt derived from title when image.alt is absent
    expect(chain.insertContent).toHaveBeenCalledWith(
      expect.objectContaining({ attrs: expect.objectContaining({ alt: 'Fallback Title' }) })
    );
  });

  it('renders the pool when persisted content exists without a succeeded job', () => {
    mockStatus({ status: null, error: null, content: contentWith([LINK_ROW], [IMAGE_ROW]) });

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('group', { name: 'Image pool' })).toBeInTheDocument();
  });

  it('routes an image attribution edit through the mutation', async () => {
    render(<BioMediaPalettes artistId="artist-1" />);

    await userEvent.click(
      screen.getByRole('button', { name: `Edit attribution for ${IMAGE_ROW.title}` })
    );
    const input = screen.getByRole('textbox', { name: /attribution/i });
    await userEvent.clear(input);
    await userEvent.type(input, 'New credit');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(updateBioImageAttribution).toHaveBeenCalledWith({
      imageId: IMAGE_ROW.id,
      attribution: 'New credit',
    });
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
    statusMock.mockReturnValue({
      data: {
        status: 'succeeded',
        error: null,
        content: contentWith([LINK_ROW], [imageNoAltNoTitle]),
      },
      isPending: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<BioMediaPalettes artistId="artist-1" />);
    // Image with no title renders with 'image' as previewLabel → button name 'Insert image image'
    await userEvent.click(screen.getByRole('button', { name: 'Insert image image' }));

    expect(chain.insertContent).toHaveBeenCalledWith(
      expect.objectContaining({ attrs: expect.objectContaining({ alt: 'Artist photo' }) })
    );
  });
});
