/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BIO_IMAGE_DRAG_MIME } from '@/lib/validation/bio-dnd-schema';
import type { BioStatusImage } from '@/lib/validation/bio-generation-schema';

import { BioImagePalette } from './bio-image-palette';

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
      data-testid="palette-image"
      data-src={src}
      data-alt={alt}
      data-width={width}
      data-height={height}
    />
  ),
}));

const IMAGES: BioStatusImage[] = [
  {
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
  },
  {
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
  },
];

describe('BioImagePalette', () => {
  it('renders a tile with attribution text', () => {
    render(
      <BioImagePalette
        images={IMAGES}
        onDelete={vi.fn()}
        onInsert={vi.fn()}
        onEditAttribution={vi.fn()}
      />
    );
    expect(screen.getByText('Photo by Example')).toBeInTheDocument();
  });

  it('renders square draggable tiles with no rounded corners', () => {
    render(
      <BioImagePalette
        images={IMAGES}
        onDelete={vi.fn()}
        onInsert={vi.fn()}
        onEditAttribution={vi.fn()}
      />
    );
    const tile = screen.getByText('Photo by Example').closest('li') as HTMLElement;
    expect(tile.className).not.toMatch(/rounded/);
  });

  it('calls onDelete with the row id when X is pressed', async () => {
    const onDelete = vi.fn();
    render(
      <BioImagePalette
        images={IMAGES}
        onDelete={onDelete}
        onInsert={vi.fn()}
        onEditAttribution={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete image Ceschi Ramos' }));
    expect(onDelete).toHaveBeenCalledWith('i1');
  });

  it('uses the image url as the delete label when title is absent', async () => {
    const onDelete = vi.fn();
    render(
      <BioImagePalette
        images={IMAGES}
        onDelete={onDelete}
        onInsert={vi.fn()}
        onEditAttribution={vi.fn()}
      />
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete image https://example.com/photo2.jpg' })
    );
    expect(onDelete).toHaveBeenCalledWith('i2');
  });

  it('sets the image drag payload on dragstart', () => {
    render(
      <BioImagePalette
        images={IMAGES}
        onDelete={vi.fn()}
        onInsert={vi.fn()}
        onEditAttribution={vi.fn()}
      />
    );
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
    render(
      <BioImagePalette
        images={IMAGES}
        onDelete={vi.fn()}
        onInsert={vi.fn()}
        onEditAttribution={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Preview Ceschi Ramos' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('uses the payload dimensions for the preview image', async () => {
    const sized: BioStatusImage = {
      id: 'i3',
      url: 'https://example.com/photo3.jpg',
      thumbnailUrl: null,
      title: 'Sized',
      attribution: null,
      license: null,
      sourceUrl: null,
      width: 1024,
      height: 768,
      isPrimary: false,
    };
    render(
      <BioImagePalette
        images={[sized]}
        onDelete={vi.fn()}
        onInsert={vi.fn()}
        onEditAttribution={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Preview Sized' }));
    const dialogImage = within(screen.getByRole('dialog')).getByTestId('palette-image');
    expect(dialogImage).toHaveAttribute('data-width', '1024');
  });

  it('falls back to default preview dimensions when the image has none', async () => {
    render(
      <BioImagePalette
        images={IMAGES}
        onDelete={vi.fn()}
        onInsert={vi.fn()}
        onEditAttribution={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Preview image' }));
    const dialogImage = within(screen.getByRole('dialog')).getByTestId('palette-image');
    expect(dialogImage).toHaveAttribute('data-height', '600');
  });

  it('uses "image" as the preview label when title is absent', () => {
    render(
      <BioImagePalette
        images={IMAGES}
        onDelete={vi.fn()}
        onInsert={vi.fn()}
        onEditAttribution={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Preview image' })).toBeInTheDocument();
  });

  it('disables the delete button when disabled prop is true', () => {
    render(
      <BioImagePalette
        images={IMAGES}
        onDelete={vi.fn()}
        onInsert={vi.fn()}
        onEditAttribution={vi.fn()}
        disabled
      />
    );
    expect(screen.getByRole('button', { name: 'Delete image Ceschi Ramos' })).toBeDisabled();
  });

  it('renders the count, shows kind badge, filters by attribution, and inserts on click', async () => {
    const imagesWithKind: BioStatusImage[] = [{ ...IMAGES[0], kind: 'photo' }, { ...IMAGES[1] }];
    const onInsert = vi.fn();
    render(
      <BioImagePalette
        images={imagesWithKind}
        onDelete={vi.fn()}
        onInsert={onInsert}
        onEditAttribution={vi.fn()}
      />
    );
    expect(screen.getByText(/Discovered images \(2\)/)).toBeInTheDocument();
    expect(screen.getByText('photo')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Filter images'), 'Example');
    expect(screen.queryByRole('button', { name: 'Insert image image' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Insert image Ceschi Ramos' }));
    expect(onInsert).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/photo.jpg' })
    );
  });

  it('disables the insert button when disabled prop is true', () => {
    render(
      <BioImagePalette
        images={IMAGES}
        onDelete={vi.fn()}
        onInsert={vi.fn()}
        onEditAttribution={vi.fn()}
        disabled
      />
    );
    expect(screen.getByRole('button', { name: 'Insert image Ceschi Ramos' })).toBeDisabled();
  });

  it('clicking the edit button reveals an input prefilled with the attribution', async () => {
    render(
      <BioImagePalette
        images={IMAGES}
        onDelete={vi.fn()}
        onInsert={vi.fn()}
        onEditAttribution={vi.fn()}
      />
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit attribution for Ceschi Ramos' })
    );
    const input = screen.getByRole('textbox', { name: /attribution/i });
    expect(input).toHaveValue('Photo by Example');
  });

  it('editing and clicking Save calls onEditAttribution with the image id and new value', async () => {
    const onEditAttribution = vi.fn();
    render(
      <BioImagePalette
        images={IMAGES}
        onDelete={vi.fn()}
        onInsert={vi.fn()}
        onEditAttribution={onEditAttribution}
      />
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit attribution for Ceschi Ramos' })
    );
    const input = screen.getByRole('textbox', { name: /attribution/i });
    await userEvent.clear(input);
    await userEvent.type(input, 'New credit');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onEditAttribution).toHaveBeenCalledWith('i1', 'New credit');
  });

  it('Cancel leaves the attribution unchanged and does not call onEditAttribution', async () => {
    const onEditAttribution = vi.fn();
    render(
      <BioImagePalette
        images={IMAGES}
        onDelete={vi.fn()}
        onInsert={vi.fn()}
        onEditAttribution={onEditAttribution}
      />
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit attribution for Ceschi Ramos' })
    );
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onEditAttribution).not.toHaveBeenCalled();
    expect(screen.getByText('Photo by Example')).toBeInTheDocument();
  });

  it('attribution input enforces maxLength of 500', async () => {
    render(
      <BioImagePalette
        images={IMAGES}
        onDelete={vi.fn()}
        onInsert={vi.fn()}
        onEditAttribution={vi.fn()}
      />
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit attribution for Ceschi Ramos' })
    );
    const input = screen.getByRole('textbox', { name: /attribution/i });
    expect(input).toHaveAttribute('maxLength', '500');
  });
});
