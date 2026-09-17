/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BIO_IMAGE_DRAG_MIME } from '@/lib/validation/bio-dnd-schema';
import type { BioStatusImage } from '@/lib/validation/bio-generation-schema';

import { BioImageTile, resolveImageLabels, type BioImageTileProps } from './bio-image-tile';

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
  }) => (
    <span
      data-testid="tile-image"
      data-src={src}
      data-alt={alt}
      data-width={width}
      data-height={height}
    />
  ),
}));

const TITLED: BioStatusImage = {
  id: 'i1',
  url: 'https://example.com/photo.jpg',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  title: 'Ceschi Ramos',
  attribution: 'Photo by Example',
  license: null,
  sourceUrl: null,
  width: 800,
  height: 600,
  isPrimary: true,
  displayOrder: null,
};

const UNTITLED: BioStatusImage = {
  id: 'i2',
  url: 'https://example.com/photo2.jpg',
  thumbnailUrl: null,
  title: null,
  attribution: null,
  license: null,
  sourceUrl: null,
  width: null,
  height: null,
  isPrimary: false,
  displayOrder: null,
};

const renderTile = (overrides: Partial<BioImageTileProps> = {}) => {
  const props: BioImageTileProps = {
    image: TITLED,
    onDelete: vi.fn(),
    onInsert: vi.fn(),
    onEditAttribution: vi.fn(),
    disabled: false,
    ...overrides,
  };
  render(
    <ul>
      <BioImageTile {...props} />
    </ul>
  );
  return props;
};

describe('resolveImageLabels', () => {
  it('prefers the thumbnail, title, and alt when present', () => {
    expect(resolveImageLabels(TITLED)).toEqual({
      thumbSrc: 'https://example.com/thumb.jpg',
      title: 'Ceschi Ramos',
      deleteLabel: 'Ceschi Ramos',
      previewLabel: 'Ceschi Ramos',
      alt: 'Ceschi Ramos',
    });
  });

  it('falls back to the url, "image", and a generic alt when the row is bare', () => {
    expect(resolveImageLabels(UNTITLED)).toEqual({
      thumbSrc: 'https://example.com/photo2.jpg',
      title: null,
      deleteLabel: 'https://example.com/photo2.jpg',
      previewLabel: 'image',
      alt: 'Artist photo',
    });
  });

  it('uses the vision alt over the title when both exist', () => {
    expect(resolveImageLabels({ ...TITLED, alt: 'Ceschi on stage' }).alt).toBe('Ceschi on stage');
  });
});

describe('BioImageTile', () => {
  it('renders the attribution text', () => {
    renderTile();
    expect(screen.getByText('Photo by Example')).toBeInTheDocument();
  });

  it('renders a square draggable tile with no rounded corners', () => {
    renderTile();
    const tile = screen.getByText('Photo by Example').closest('li') as HTMLElement;
    expect(tile).toHaveAttribute('draggable', 'true');
    expect(tile.className).not.toMatch(/rounded/);
  });

  it('calls onDelete with the row id when X is pressed', async () => {
    const { onDelete } = renderTile();
    await userEvent.click(screen.getByRole('button', { name: 'Delete image Ceschi Ramos' }));
    expect(onDelete).toHaveBeenCalledWith('i1');
  });

  it('uses the image url as the delete label when the title is absent', async () => {
    const { onDelete } = renderTile({ image: UNTITLED });
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete image https://example.com/photo2.jpg' })
    );
    expect(onDelete).toHaveBeenCalledWith('i2');
  });

  it('sets the image drag payload on dragstart', () => {
    renderTile();
    const setData = vi.fn();
    fireEvent.dragStart(screen.getByText('Photo by Example').closest('li') as HTMLElement, {
      dataTransfer: { setData, effectAllowed: '' },
    });
    expect(setData).toHaveBeenCalledWith(
      BIO_IMAGE_DRAG_MIME,
      JSON.stringify({
        url: 'https://example.com/photo.jpg',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        title: 'Ceschi Ramos',
        attribution: 'Photo by Example',
        alt: 'Ceschi Ramos',
        width: 800,
        height: 600,
      })
    );
  });

  it('opens a preview dialog when the eye button is pressed', async () => {
    renderTile();
    await userEvent.click(screen.getByRole('button', { name: 'Preview Ceschi Ramos' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('uses the payload dimensions for the preview image', async () => {
    renderTile({ image: { ...UNTITLED, id: 'i3', title: 'Sized', width: 1024, height: 768 } });
    await userEvent.click(screen.getByRole('button', { name: 'Preview Sized' }));
    const dialogImage = within(screen.getByRole('dialog')).getByTestId('tile-image');
    expect(dialogImage).toHaveAttribute('data-width', '1024');
  });

  it('falls back to default preview dimensions when the image has none', async () => {
    renderTile({ image: UNTITLED });
    await userEvent.click(screen.getByRole('button', { name: 'Preview image' }));
    const dialogImage = within(screen.getByRole('dialog')).getByTestId('tile-image');
    expect(dialogImage).toHaveAttribute('data-height', '600');
  });

  it('inserts the image when Plus is pressed', async () => {
    const { onInsert } = renderTile();
    await userEvent.click(screen.getByRole('button', { name: 'Insert image Ceschi Ramos' }));
    expect(onInsert).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/photo.jpg' })
    );
  });

  it('shows the kind badge when the row has a kind', () => {
    renderTile({ image: { ...TITLED, kind: 'photo' } });
    expect(screen.getByText('photo')).toBeInTheDocument();
  });

  it('shows a Custom badge only on custom rows', () => {
    renderTile({ image: { ...TITLED, origin: 'custom' } });
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('shows no Custom badge on a generated row', () => {
    renderTile({ image: { ...TITLED, origin: 'generated' } });
    expect(screen.queryByText('Custom')).not.toBeInTheDocument();
  });

  it('disables delete, insert, and edit when disabled', () => {
    renderTile({ disabled: true });
    expect(screen.getByRole('button', { name: 'Delete image Ceschi Ramos' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Insert image Ceschi Ramos' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Edit attribution for Ceschi Ramos' })
    ).toBeDisabled();
  });

  it('reveals an input prefilled with the attribution when edit is pressed', async () => {
    renderTile();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit attribution for Ceschi Ramos' })
    );
    expect(screen.getByRole('textbox', { name: 'Attribution' })).toHaveValue('Photo by Example');
  });

  it('saves an edited attribution with the image id', async () => {
    const { onEditAttribution } = renderTile();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit attribution for Ceschi Ramos' })
    );
    const input = screen.getByRole('textbox', { name: 'Attribution' });
    await userEvent.clear(input);
    await userEvent.type(input, 'New credit');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onEditAttribution).toHaveBeenCalledWith('i1', 'New credit');
  });

  it('cancelling leaves the attribution unchanged', async () => {
    const { onEditAttribution } = renderTile();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit attribution for Ceschi Ramos' })
    );
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onEditAttribution).not.toHaveBeenCalled();
    expect(screen.getByText('Photo by Example')).toBeInTheDocument();
  });

  it('offers "Add attribution" when the row has none', () => {
    renderTile({ image: UNTITLED });
    expect(screen.getByText('Add attribution')).toBeInTheDocument();
  });

  it('renders extra actions before the delete button and extra badges beside the license', () => {
    renderTile({
      actions: <button type="button">Use as display image</button>,
      badges: <span>Suggested</span>,
    });
    expect(screen.getByRole('button', { name: 'Use as display image' })).toBeInTheDocument();
    expect(screen.getByText('Suggested')).toBeInTheDocument();
  });
});
