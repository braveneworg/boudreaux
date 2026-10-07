/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BIO_IMAGE_DRAG_MIME } from '@/lib/validation/bio-dnd-schema';
import type { BioStatusImage } from '@/lib/validation/bio-generation-schema';

import { BioImageManager, type BioImageManagerProps } from './bio-image-manager';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="manager-image" data-src={src} data-alt={alt} />
  ),
}));

// The upload zone collects the fields; stub it with a button that hands one
// file to the pool's upload so the manager's forwarding can be exercised.
vi.mock('./bio-image-upload-zone', () => ({
  BioImageUploadZone: ({
    onUpload,
    disabled,
    isUploading,
    errorMessage,
  }: {
    onUpload: (file: File, fields: { alt: null; attribution: string }) => Promise<unknown>;
    disabled?: boolean;
    isUploading?: boolean;
    errorMessage?: string | null;
  }) => (
    <button
      type="button"
      data-testid="upload-zone-stub"
      data-uploading={isUploading ? 'true' : 'false'}
      data-error={errorMessage ?? ''}
      disabled={disabled}
      onClick={() =>
        void onUpload(new File(['x'], 'zone.jpg', { type: 'image/jpeg' }), {
          alt: null,
          attribution: '',
        })
      }
    >
      Simulate upload
    </button>
  ),
}));

vi.mock('./image-source-links-section', () => ({
  ImageSourceLinksSection: ({ artistId, disabled }: { artistId: string; disabled?: boolean }) => (
    <div data-testid="image-sources-stub" data-artist-id={artistId} data-disabled={disabled} />
  ),
}));

const image = (id: string, overrides: Partial<BioStatusImage> = {}): BioStatusImage => ({
  id,
  url: `https://cdn.example/${id}.webp`,
  thumbnailUrl: null,
  title: id,
  attribution: null,
  isPrimary: false,
  displayOrder: null,
  alt: `${id} described`,
  ...overrides,
});

const POOL = [
  image('rest'),
  image('suggested', { isPrimary: true }),
  image('second', { displayOrder: 1, origin: 'custom' }),
  image('first', { displayOrder: 0, origin: 'custom' }),
  image('bare', { alt: null }),
];

const renderManager = (overrides: Partial<BioImageManagerProps> = {}) => {
  const props: BioImageManagerProps = {
    artistId: 'artist-1',
    images: POOL,
    isPublished: false,
    onDelete: vi.fn(),
    onInsert: vi.fn(),
    onEditAttribution: vi.fn(),
    onEditAlt: vi.fn(),
    onSetDisplayImages: vi.fn(),
    onUpload: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
  render(<BioImageManager {...props} />);
  return props;
};

const useButton = (name: string) =>
  screen.getByRole('button', { name: `Use ${name} as display image` });

const dropTarget = () => screen.getByRole('group', { name: 'Add a display image' });

/** A DataTransfer stand-in carrying a pool tile's payload or files. */
const transfer = ({ id, files = [] }: { id?: string; files?: File[] }) => ({
  types: [...(id ? [BIO_IMAGE_DRAG_MIME] : []), ...(files.length ? ['Files'] : [])],
  getData: (type: string) =>
    type === BIO_IMAGE_DRAG_MIME && id
      ? JSON.stringify({
          id,
          url: `https://cdn.example/${id}.webp`,
          thumbnailUrl: null,
          title: id,
          attribution: null,
          alt: `${id} described`,
          width: null,
          height: null,
        })
      : '',
  files,
});

const jpeg = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });

/** The pool tile whose preview button names the given image. */
const tileFor = (name: string): HTMLElement => {
  const tiles = within(screen.getByRole('group', { name: 'Image pool' })).getAllByRole('listitem');
  const [tile] = tiles.filter(
    (candidate) => within(candidate).queryByRole('button', { name: `Preview ${name}` }) !== null
  );
  return tile;
};

/** Every "Shown …" badge text on one tile. */
const shownBadgesOn = (name: string): string[] =>
  within(tileFor(name))
    .queryAllByText(/^Shown/)
    .map((badge) => badge.textContent ?? '');

describe('BioImageManager', () => {
  it('is a labelled region holding the strip, the upload zone, and the pool', () => {
    renderManager();
    const region = screen.getByRole('region', { name: 'Bio images' });
    expect(within(region).getByRole('list', { name: 'Display images' })).toBeInTheDocument();
    expect(within(region).getByTestId('upload-zone-stub')).toBeInTheDocument();
    expect(within(region).getByRole('group', { name: 'Image pool' })).toBeInTheDocument();
  });

  it('orders the sections: upload zone, then display images, then the pool', () => {
    renderManager();
    const region = screen.getByRole('region', { name: 'Bio images' });
    const zone = within(region).getByTestId('upload-zone-stub');
    const strip = within(region).getByRole('list', { name: 'Display images' });
    const pool = within(region).getByRole('group', { name: 'Image pool' });
    expect(zone.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strip.compareDocumentPosition(pool) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the image-sources editor below the pool, passing artist id and disabled', () => {
    renderManager({ disabled: true });
    const region = screen.getByRole('region', { name: 'Bio images' });
    const stub = within(region).getByTestId('image-sources-stub');
    expect(stub).toHaveAttribute('data-artist-id', 'artist-1');
    expect(stub).toHaveAttribute('data-disabled', 'true');
    const pool = within(region).getByRole('group', { name: 'Image pool' });
    expect(pool.compareDocumentPosition(stub) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('derives the chosen strip from the pool in display order', () => {
    renderManager();
    const items = within(screen.getByRole('list', { name: 'Display images' })).getAllByRole(
      'listitem'
    );
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'first, display image 1 of 2',
      'second, display image 2 of 2',
    ]);
  });

  it('orders the pool: display images, then suggested, then the rest', () => {
    renderManager();
    const tiles = within(screen.getByRole('group', { name: 'Image pool' })).getAllByRole(
      'listitem'
    );
    const names = tiles.map((tile) =>
      within(tile)
        .getByRole('button', { name: /^Preview / })
        .getAttribute('aria-label')
    );
    expect(names).toEqual([
      'Preview first',
      'Preview second',
      'Preview suggested',
      'Preview rest',
      'Preview bare',
    ]);
  });

  it('badges chosen tiles with their position and suggested tiles as Suggested', () => {
    renderManager();
    const pool = screen.getByRole('group', { name: 'Image pool' });
    expect(within(pool).getByText('Display 1')).toBeInTheDocument();
    expect(within(pool).getByText('Display 2')).toBeInTheDocument();
    expect(within(pool).getByText('Suggested')).toBeInTheDocument();
  });

  // While nothing is chosen the page shows a fallback tier (ADR-0008
  // addendum); the tiles it takes are marked so the admin sees what the public
  // sees.
  it('marks the suggested images the page shows while nothing is chosen', () => {
    renderManager({
      images: [
        image('rest'),
        image('shown', { isPrimary: true }),
        image('no-alt', { isPrimary: true, alt: null }),
      ],
    });

    expect(shownBadgesOn('shown')).toEqual(['Shown (suggested)']);
  });

  it('drops the Suggested badge from a suggested image the page shows', () => {
    renderManager({ images: [image('shown', { isPrimary: true })] });

    expect(within(tileFor('shown')).queryByText('Suggested')).not.toBeInTheDocument();
  });

  it('keeps an alt-less suggestion Suggested and unmarked, since the page skips it', () => {
    renderManager({
      images: [
        image('shown', { isPrimary: true }),
        image('no-alt', { isPrimary: true, alt: null }),
      ],
    });

    expect(within(tileFor('no-alt')).getByText('Suggested')).toBeInTheDocument();
    expect(shownBadgesOn('no-alt')).toEqual([]);
  });

  it('does not mark unsuggested pool images while a suggestion is shown', () => {
    renderManager({ images: [image('rest'), image('shown', { isPrimary: true })] });

    expect(shownBadgesOn('rest')).toEqual([]);
  });

  it('keeps a suggestion beyond the cap Suggested and unmarked', () => {
    renderManager({
      images: ['s1', 's2', 's3', 's4'].map((id) => image(id, { isPrimary: true })),
    });

    expect(within(tileFor('s4')).getByText('Suggested')).toBeInTheDocument();
    expect(shownBadgesOn('s4')).toEqual([]);
  });

  it('marks the first pool images with alt text when no suggestion has alt text', () => {
    renderManager({
      images: [
        image('no-alt-suggestion', { isPrimary: true, alt: null }),
        image('a'),
        image('bare', { alt: null }),
        image('b'),
        image('c'),
        image('d'),
      ],
    });

    expect(['a', 'b', 'c', 'd', 'bare', 'no-alt-suggestion'].map(shownBadgesOn)).toEqual([
      ['Shown (first in pool)'],
      ['Shown (first in pool)'],
      ['Shown (first in pool)'],
      [],
      [],
      [],
    ]);
  });

  it('marks nothing as shown once a human has chosen', () => {
    renderManager();

    expect(
      within(screen.getByRole('group', { name: 'Image pool' })).queryAllByText(/^Shown/)
    ).toEqual([]);
  });

  it('shows the pool count', () => {
    renderManager();
    expect(screen.getByRole('heading', { name: 'Image pool (5)' })).toBeInTheDocument();
  });

  it('adds a tile to the end of the chosen set when "use" is pressed', async () => {
    const { onSetDisplayImages } = renderManager();
    await userEvent.click(useButton('suggested'));
    expect(onSetDisplayImages).toHaveBeenCalledWith(['first', 'second', 'suggested']);
  });

  it('explains the "use" button on hover, and swaps the hover text for the reason when disabled', () => {
    renderManager();
    expect(useButton('suggested')).toHaveAttribute('title', 'Add to display images');
    expect(useButton('first')).toHaveAttribute('title', 'Already a display image');
  });

  it('disables "use" on a tile that is already chosen, with the reason', () => {
    renderManager();
    const button = useButton('first');
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Already a display image');
  });

  // The set action backfills a blank alt with the artist's name, so an
  // alt-less upload is no longer stuck behind a disabled plus (2026-09-26).
  it('lets a tile without alt text be used', async () => {
    const { onSetDisplayImages } = renderManager();
    const button = useButton('bare');
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onSetDisplayImages).toHaveBeenCalledWith(['first', 'second', 'bare']);
  });

  it('keeps "use" enabled past three — the chosen set has no cap', async () => {
    const { onSetDisplayImages } = renderManager({
      images: [...POOL, image('third', { displayOrder: 2, origin: 'custom' })],
    });
    const button = useButton('suggested');
    expect(button).toBeEnabled();

    await userEvent.click(button);

    expect(onSetDisplayImages).toHaveBeenCalledWith(['first', 'second', 'third', 'suggested']);
  });

  // ADR-0019: a published artist's chosen set never becomes empty, so its
  // last chosen image cannot be deleted from the pool either.
  it("disables deleting a published artist's last chosen image, with the reason", () => {
    renderManager({
      images: [image('first', { displayOrder: 0, origin: 'custom' }), image('rest')],
      isPublished: true,
    });

    const deleteFirst = screen.getByRole('button', { name: 'Delete image first' });
    expect(deleteFirst).toBeDisabled();
    expect(deleteFirst).toHaveAccessibleDescription(/at least one display image/i);
    expect(screen.getByRole('button', { name: 'Delete image rest' })).toBeEnabled();
  });

  it('removes from the chosen set through the strip', async () => {
    const { onSetDisplayImages } = renderManager();
    await userEvent.click(screen.getByRole('button', { name: 'Remove first from display images' }));
    expect(onSetDisplayImages).toHaveBeenCalledWith(['second']);
  });

  it('reorders the chosen set through the strip', async () => {
    const { onSetDisplayImages } = renderManager();
    await userEvent.click(screen.getByRole('button', { name: 'Move second earlier' }));
    expect(onSetDisplayImages).toHaveBeenCalledWith(['second', 'first']);
  });

  it('filters the pool by title, attribution, alt, or kind', async () => {
    renderManager({ images: [image('a', { title: 'Alpha shot' }), image('b', { kind: 'cover' })] });
    await userEvent.type(screen.getByLabelText('Filter images'), 'cover');
    const pool = screen.getByRole('group', { name: 'Image pool' });
    expect(
      within(pool).queryByRole('button', { name: 'Preview Alpha shot' })
    ).not.toBeInTheDocument();
    expect(within(pool).getByRole('button', { name: 'Preview b' })).toBeInTheDocument();
  });

  it('routes delete, insert, attribution, and alt edits to the callbacks', async () => {
    const { onDelete, onInsert, onEditAlt } = renderManager({ images: [image('only')] });
    await userEvent.click(screen.getByRole('button', { name: 'Delete image only' }));
    await userEvent.click(screen.getByRole('button', { name: 'Insert image only' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit alt text for only' }));
    const input = screen.getByRole('textbox', { name: 'Alt text' });
    await userEvent.clear(input);
    await userEvent.type(input, 'New alt');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onDelete).toHaveBeenCalledWith('only');
    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'only' }));
    expect(onEditAlt).toHaveBeenCalledWith('only', 'New alt');
  });

  // Whether an upload joins the display images is the pool module's call
  // (use-artist-pool.spec); the manager only forwards the file and shows the
  // pool's upload state on both surfaces.
  it('forwards a zone upload to the pool and never writes the display images itself', async () => {
    const { onUpload, onSetDisplayImages } = renderManager();
    await userEvent.click(screen.getByTestId('upload-zone-stub'));
    expect(vi.mocked(onUpload).mock.calls).toEqual([
      [expect.any(File), { alt: null, attribution: '' }],
    ]);
    expect(onSetDisplayImages).not.toHaveBeenCalled();
  });

  it('shows the pool’s upload state on the zone and the strip', () => {
    renderManager({ isUploading: true, uploadError: 'S3 refused' });
    expect(screen.getByTestId('upload-zone-stub')).toHaveAttribute('data-uploading', 'true');
    expect(screen.getByTestId('upload-zone-stub')).toHaveAttribute('data-error', 'S3 refused');
    expect(screen.getByRole('alert')).toHaveTextContent('S3 refused');
  });

  describe('display image drop target', () => {
    it('adds a pool image dropped on the strip', () => {
      const { onSetDisplayImages } = renderManager();

      fireEvent.drop(dropTarget(), { dataTransfer: transfer({ id: 'suggested' }) });

      expect(vi.mocked(onSetDisplayImages).mock.calls).toEqual([
        [['first', 'second', 'suggested']],
      ]);
    });

    it('ignores a dropped pool image that is already chosen', () => {
      const { onSetDisplayImages } = renderManager();

      fireEvent.drop(dropTarget(), { dataTransfer: transfer({ id: 'first' }) });

      expect(onSetDisplayImages).not.toHaveBeenCalled();
    });

    it('ignores a dropped id that is not in the pool', () => {
      const { onSetDisplayImages } = renderManager();

      fireEvent.drop(dropTarget(), { dataTransfer: transfer({ id: 'foreign' }) });

      expect(onSetDisplayImages).not.toHaveBeenCalled();
    });

    it('hands a dropped file to the pool upload with blank fields', async () => {
      const { onUpload, onSetDisplayImages } = renderManager();

      fireEvent.drop(dropTarget(), { dataTransfer: transfer({ files: [jpeg] }) });

      await waitFor(() =>
        expect(vi.mocked(onUpload).mock.calls).toEqual([[jpeg, { alt: null, attribution: '' }]])
      );
      expect(onSetDisplayImages).not.toHaveBeenCalled();
    });

    // The type check, the pipeline and the failure copy are the pool's
    // (use-artist-pool.spec); the strip only shows what the pool reports.
    it('shows the pool’s upload failure on the strip without touching the set', () => {
      const { onSetDisplayImages } = renderManager({ uploadError: 'S3 refused' });

      expect(screen.getByRole('alert')).toHaveTextContent('S3 refused');
      expect(onSetDisplayImages).not.toHaveBeenCalled();
    });
  });

  it('mounts with an empty pool and says so', () => {
    renderManager({ images: [] });
    expect(screen.getByRole('region', { name: 'Bio images' })).toBeInTheDocument();
    expect(screen.getByText(/No images yet/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Image pool' })).not.toBeInTheDocument();
    expect(screen.getByTestId('upload-zone-stub')).toBeInTheDocument();
  });

  it('shows a loading status instead of the pool while loading', () => {
    renderManager({ images: [], isLoading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading images');
    expect(screen.queryByText(/No images yet/)).not.toBeInTheDocument();
  });

  // A failed status read must never look like an empty pool: an nginx 429
  // once showed "Image pool (0)" for an artist with 36 images (2026-09-21).
  it('shows the load failure instead of the empty state', () => {
    renderManager({
      images: [],
      loadError: 'the server is rate limiting requests, try again in a moment',
      onRetry: vi.fn(),
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't load the image pool — the server is rate limiting requests, try again in a moment."
    );
    expect(screen.queryByText(/No images yet/)).not.toBeInTheDocument();
  });

  it('retries the load when Retry is pressed', async () => {
    const onRetry = vi.fn();
    renderManager({ images: [], loadError: 'something broke', onRetry });
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry.mock.calls).toEqual([[]]);
  });

  it('shows the loading status, not the failure, while a load is in flight', () => {
    renderManager({ images: [], isLoading: true, loadError: 'something broke' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading images');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the pool, not the failure, when images are already loaded', () => {
    renderManager({ loadError: 'something broke' });
    expect(screen.getByRole('group', { name: 'Image pool' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables the tiles, the strip, and the upload zone when disabled', () => {
    renderManager({ disabled: true });
    expect(useButton('suggested')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete image rest' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move second earlier' })).toBeDisabled();
    expect(screen.getByTestId('upload-zone-stub')).toBeDisabled();
  });
});
