/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ArtistBioImageRecord } from '@/lib/types/domain/artist';
import type { BioStatusImage } from '@/lib/validation/bio-generation-schema';

import { BioImageManager, type BioImageManagerProps } from './bio-image-manager';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="manager-image" data-src={src} data-alt={alt} />
  ),
}));

// The upload zone owns the presign pipeline; stub it with a button that
// reports a persisted row so auto-selection can be exercised here.
const uploadedRecord = vi.hoisted(() => ({ current: null as ArtistBioImageRecord | null }));
vi.mock('./bio-image-upload-zone', () => ({
  BioImageUploadZone: ({
    artistId,
    onUploaded,
    disabled,
  }: {
    artistId: string;
    onUploaded: (image: ArtistBioImageRecord) => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      data-testid="upload-zone-stub"
      data-artist-id={artistId}
      disabled={disabled}
      onClick={() => uploadedRecord.current && onUploaded(uploadedRecord.current)}
    >
      Simulate upload
    </button>
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
    onDelete: vi.fn(),
    onInsert: vi.fn(),
    onEditAttribution: vi.fn(),
    onEditAlt: vi.fn(),
    onSetDisplayImages: vi.fn(),
    onUploaded: vi.fn(),
    ...overrides,
  };
  render(<BioImageManager {...props} />);
  return props;
};

const useButton = (name: string) =>
  screen.getByRole('button', { name: `Use ${name} as display image` });

beforeEach(() => {
  uploadedRecord.current = null;
});

describe('BioImageManager', () => {
  it('is a labelled region holding the strip, the upload zone, and the pool', () => {
    renderManager();
    const region = screen.getByRole('region', { name: 'Bio images' });
    expect(within(region).getByRole('list', { name: 'Display images' })).toBeInTheDocument();
    expect(within(region).getByTestId('upload-zone-stub')).toHaveAttribute(
      'data-artist-id',
      'artist-1'
    );
    expect(within(region).getByRole('group', { name: 'Image pool' })).toBeInTheDocument();
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

  it('shows the pool count', () => {
    renderManager();
    expect(screen.getByRole('heading', { name: 'Image pool (5)' })).toBeInTheDocument();
  });

  it('adds a tile to the end of the chosen set when "use" is pressed', async () => {
    const { onSetDisplayImages } = renderManager();
    await userEvent.click(useButton('suggested'));
    expect(onSetDisplayImages).toHaveBeenCalledWith(['first', 'second', 'suggested']);
  });

  it('disables "use" on a tile that is already chosen, with the reason', () => {
    renderManager();
    const button = useButton('first');
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Already a display image');
  });

  it('disables "use" on a tile without alt text, with the reason', () => {
    renderManager();
    const button = useButton('bare');
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Add alt text before using this image');
  });

  it('disables "use" everywhere once the cap is reached, with the reason', () => {
    renderManager({
      images: [...POOL, image('third', { displayOrder: 2, origin: 'custom' })],
    });
    const button = useButton('suggested');
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/Remove a display image first/);
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

  it('reports an upload and auto-selects it when there is room and it has alt text', async () => {
    uploadedRecord.current = { id: 'new', alt: 'described' } as ArtistBioImageRecord;
    const { onUploaded, onSetDisplayImages } = renderManager();
    await userEvent.click(screen.getByTestId('upload-zone-stub'));
    expect(onUploaded).toHaveBeenCalledWith(uploadedRecord.current);
    expect(onSetDisplayImages).toHaveBeenCalledWith(['first', 'second', 'new']);
  });

  it('reports an upload without selecting it when it has no alt text', async () => {
    uploadedRecord.current = { id: 'new', alt: null } as ArtistBioImageRecord;
    const { onUploaded, onSetDisplayImages } = renderManager();
    await userEvent.click(screen.getByTestId('upload-zone-stub'));
    expect(onUploaded).toHaveBeenCalled();
    expect(onSetDisplayImages).not.toHaveBeenCalled();
  });

  it('reports an upload without selecting it when the cap is reached', async () => {
    uploadedRecord.current = { id: 'new', alt: 'described' } as ArtistBioImageRecord;
    const { onSetDisplayImages } = renderManager({
      images: [...POOL, image('third', { displayOrder: 2, origin: 'custom' })],
    });
    await userEvent.click(screen.getByTestId('upload-zone-stub'));
    expect(onSetDisplayImages).not.toHaveBeenCalled();
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

  it('disables the tiles, the strip, and the upload zone when disabled', () => {
    renderManager({ disabled: true });
    expect(useButton('suggested')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete image rest' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move second earlier' })).toBeDisabled();
    expect(screen.getByTestId('upload-zone-stub')).toBeDisabled();
  });
});
