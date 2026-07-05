/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type {
  BioGenerationStatusResponse,
  BioStatusImage,
  BioStatusLink,
} from '@/lib/validation/bio-generation-schema';

import { BioMediaPalettes } from './bio-media-palettes';

import type { Editor } from '@tiptap/react';

const statusMock = vi.hoisted(() => vi.fn());
const deleteBioLink = vi.hoisted(() => vi.fn());
const deleteBioImage = vi.hoisted(() => vi.fn());
const updateBioImageAttribution = vi.hoisted(() => vi.fn());
const pending = vi.hoisted(() => ({ link: false, image: false, updating: false }));
/** Controls what `registry.getTarget()` returns for insert tests. */
const mockGetTarget = vi.hoisted(() => vi.fn(() => null as Editor | null));

vi.mock('@/app/hooks/use-artist-bio-generation-status-query', () => ({
  useArtistBioGenerationStatusQuery: (artistId: string) => statusMock(artistId),
}));

vi.mock('@/app/hooks/mutations/use-bio-media-mutations', () => ({
  useDeleteBioLinkMutation: () => ({ deleteBioLink, isDeletingBioLink: pending.link }),
  useDeleteBioImageMutation: () => ({ deleteBioImage, isDeletingBioImage: pending.image }),
  useUpdateBioImageAttributionMutation: () => ({
    updateBioImageAttribution,
    isUpdatingBioImageAttribution: pending.updating,
  }),
}));

vi.mock('@/lib/utils/api-base-url', () => ({
  getApiBaseUrl: () => 'https://fakefourrecords.com',
}));

// Expose a controllable registry so insert tests can drive the target editor.
vi.mock('./bio-editor-registry', () => ({
  useBioEditorRegistry: () => ({ getTarget: mockGetTarget }),
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
  isPrimary: true,
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

const mockStatus = (data: BioGenerationStatusResponse | undefined): void => {
  statusMock.mockReturnValue({
    data,
    isPending: false,
    error: Error('Unknown error'),
    refetch: vi.fn(),
  });
};

beforeEach(() => {
  pending.link = false;
  pending.image = false;
  pending.updating = false;
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

  it('renders the image palette when generated content exists', () => {
    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('group', { name: 'Discovered images' })).toBeInTheDocument();
  });

  it('renders nothing when the artist has no generated content', () => {
    mockStatus({ status: null, error: null, content: null });

    const { container } = render(<BioMediaPalettes artistId="artist-1" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while a generation job is still processing', () => {
    mockStatus({ status: 'processing', error: null, content: null });

    const { container } = render(<BioMediaPalettes artistId="artist-1" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing before the status query resolves', () => {
    mockStatus(undefined);

    const { container } = render(<BioMediaPalettes artistId="artist-1" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the content has no links and no images', () => {
    mockStatus({ status: 'succeeded', error: null, content: contentWith([], []) });

    const { container } = render(<BioMediaPalettes artistId="artist-1" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('omits the link palette when there are no links', () => {
    mockStatus({ status: 'succeeded', error: null, content: contentWith([], [IMAGE_ROW]) });

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.queryByRole('group', { name: 'Discovered links' })).not.toBeInTheDocument();
  });

  it('omits the image palette when there are no images', () => {
    mockStatus({ status: 'succeeded', error: null, content: contentWith([LINK_ROW], []) });

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.queryByRole('group', { name: 'Discovered images' })).not.toBeInTheDocument();
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

  it('insertLink is a no-op when no editor is registered (getTarget returns null)', async () => {
    mockGetTarget.mockReturnValue(null);
    render(<BioMediaPalettes artistId="artist-1" />);

    // Click the insert button. With no target editor the function returns early
    // and no error is thrown; the only side-effect is the getTarget() call.
    await userEvent.click(screen.getByRole('button', { name: 'Insert link Wikipedia' }));

    expect(mockGetTarget).toHaveBeenCalled();
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

  it('insertImage is a no-op when no editor is registered (getTarget returns null)', async () => {
    mockGetTarget.mockReturnValue(null);
    render(<BioMediaPalettes artistId="artist-1" />);

    await userEvent.click(screen.getByRole('button', { name: 'Insert image Portrait' }));

    expect(mockGetTarget).toHaveBeenCalled();
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

  it('renders the palettes when persisted content exists without a succeeded job', () => {
    mockStatus({ status: null, error: null, content: contentWith([LINK_ROW], [IMAGE_ROW]) });

    render(<BioMediaPalettes artistId="artist-1" />);

    expect(screen.getByRole('group', { name: 'Discovered images' })).toBeInTheDocument();
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
