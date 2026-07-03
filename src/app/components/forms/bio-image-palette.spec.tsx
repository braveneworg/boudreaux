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
    render(<BioImagePalette images={IMAGES} onDelete={vi.fn()} />);
    expect(screen.getByText('Photo by Example')).toBeInTheDocument();
  });

  it('calls onDelete with the row id when X is pressed', async () => {
    const onDelete = vi.fn();
    render(<BioImagePalette images={IMAGES} onDelete={onDelete} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete image Ceschi Ramos' }));
    expect(onDelete).toHaveBeenCalledWith('i1');
  });

  it('uses the image url as the delete label when title is absent', async () => {
    const onDelete = vi.fn();
    render(<BioImagePalette images={IMAGES} onDelete={onDelete} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete image https://example.com/photo2.jpg' })
    );
    expect(onDelete).toHaveBeenCalledWith('i2');
  });

  it('sets the image drag payload on dragstart', () => {
    render(<BioImagePalette images={IMAGES} onDelete={vi.fn()} />);
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
    render(<BioImagePalette images={IMAGES} onDelete={vi.fn()} />);
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
    render(<BioImagePalette images={[sized]} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Preview Sized' }));
    const dialogImage = within(screen.getByRole('dialog')).getByTestId('palette-image');
    expect(dialogImage).toHaveAttribute('data-width', '1024');
  });

  it('falls back to default preview dimensions when the image has none', async () => {
    render(<BioImagePalette images={IMAGES} onDelete={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Preview image' }));
    const dialogImage = within(screen.getByRole('dialog')).getByTestId('palette-image');
    expect(dialogImage).toHaveAttribute('data-height', '600');
  });

  it('uses "image" as the preview label when title is absent', () => {
    render(<BioImagePalette images={IMAGES} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Preview image' })).toBeInTheDocument();
  });

  it('disables the delete button when disabled prop is true', () => {
    render(<BioImagePalette images={IMAGES} onDelete={vi.fn()} disabled />);
    expect(screen.getByRole('button', { name: 'Delete image Ceschi Ramos' })).toBeDisabled();
  });
});
