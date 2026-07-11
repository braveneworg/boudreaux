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

  it('disables the edit attribution button when disabled prop is true', () => {
    render(
      <BioImagePalette
        images={IMAGES}
        onDelete={vi.fn()}
        onInsert={vi.fn()}
        onEditAttribution={vi.fn()}
        disabled
      />
    );
    expect(
      screen.getByRole('button', { name: 'Edit attribution for Ceschi Ramos' })
    ).toBeDisabled();
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

  describe('custom-first ordering and Custom badge', () => {
    const MIXED_IMAGES: BioStatusImage[] = [
      {
        id: 'ig1',
        url: 'https://example.com/g1.jpg',
        thumbnailUrl: null,
        title: 'Generated Image 1',
        attribution: null,
        license: null,
        sourceUrl: null,
        width: null,
        height: null,
        isPrimary: false,
        origin: 'generated',
      },
      {
        id: 'ic1',
        url: 'https://example.com/c1.jpg',
        thumbnailUrl: null,
        title: 'Custom Image 1',
        attribution: null,
        license: null,
        sourceUrl: null,
        width: null,
        height: null,
        isPrimary: false,
        origin: 'custom',
      },
      {
        id: 'ig2',
        url: 'https://example.com/g2.jpg',
        thumbnailUrl: null,
        title: 'Generated Image 2',
        attribution: null,
        license: null,
        sourceUrl: null,
        width: null,
        height: null,
        isPrimary: false,
        origin: 'generated',
      },
    ];

    it('renders custom-origin tiles before generated tiles', () => {
      render(
        <BioImagePalette
          images={MIXED_IMAGES}
          onDelete={vi.fn()}
          onInsert={vi.fn()}
          onEditAttribution={vi.fn()}
        />
      );
      const buttons = screen.getAllByRole('button', { name: /^Delete image / });
      const names = buttons.map((b) => b.getAttribute('aria-label') ?? '');
      const customIdx = names.findIndex((n) => n.includes('Custom Image 1'));
      const gen1Idx = names.findIndex((n) => n.includes('Generated Image 1'));
      const gen2Idx = names.findIndex((n) => n.includes('Generated Image 2'));
      expect(customIdx).toBeLessThan(gen1Idx);
      expect(customIdx).toBeLessThan(gen2Idx);
    });

    it('preserves the relative order of generated tiles after the custom tile', () => {
      render(
        <BioImagePalette
          images={MIXED_IMAGES}
          onDelete={vi.fn()}
          onInsert={vi.fn()}
          onEditAttribution={vi.fn()}
        />
      );
      const buttons = screen.getAllByRole('button', { name: /^Delete image / });
      const names = buttons.map((b) => b.getAttribute('aria-label') ?? '');
      const gen1Idx = names.findIndex((n) => n.includes('Generated Image 1'));
      const gen2Idx = names.findIndex((n) => n.includes('Generated Image 2'));
      expect(gen1Idx).toBeLessThan(gen2Idx);
    });

    it('shows a Custom badge on a custom-origin tile', () => {
      render(
        <BioImagePalette
          images={MIXED_IMAGES}
          onDelete={vi.fn()}
          onInsert={vi.fn()}
          onEditAttribution={vi.fn()}
        />
      );
      const customTile = screen
        .getByRole('button', { name: 'Delete image Custom Image 1' })
        .closest('li') as HTMLElement;
      expect(within(customTile).getByText('Custom')).toBeInTheDocument();
    });

    it('does not show a Custom badge on a generated-origin tile', () => {
      render(
        <BioImagePalette
          images={MIXED_IMAGES}
          onDelete={vi.fn()}
          onInsert={vi.fn()}
          onEditAttribution={vi.fn()}
        />
      );
      const genTile = screen
        .getByRole('button', { name: 'Delete image Generated Image 1' })
        .closest('li') as HTMLElement;
      expect(within(genTile).queryByText('Custom')).not.toBeInTheDocument();
    });

    it('does not show a Custom badge on a null-origin tile', () => {
      const nullOriginImage: BioStatusImage[] = [
        {
          id: 'in1',
          url: 'https://example.com/n1.jpg',
          thumbnailUrl: null,
          title: 'Null Origin Image',
          attribution: null,
          license: null,
          sourceUrl: null,
          width: null,
          height: null,
          isPrimary: false,
          origin: null,
        },
      ];
      render(
        <BioImagePalette
          images={nullOriginImage}
          onDelete={vi.fn()}
          onInsert={vi.fn()}
          onEditAttribution={vi.fn()}
        />
      );
      const tile = screen
        .getByRole('button', { name: 'Delete image Null Origin Image' })
        .closest('li') as HTMLElement;
      expect(within(tile).queryByText('Custom')).not.toBeInTheDocument();
    });
  });

  describe('license badge', () => {
    const buildImage = (overrides: Partial<BioStatusImage>): BioStatusImage => ({
      id: 'lic1',
      url: 'https://example.com/lic.jpg',
      thumbnailUrl: null,
      title: 'Licensed Image',
      attribution: null,
      license: null,
      sourceUrl: null,
      width: null,
      height: null,
      isPrimary: false,
      ...overrides,
    });

    const renderTile = (image: BioStatusImage): HTMLElement => {
      render(
        <BioImagePalette
          images={[image]}
          onDelete={vi.fn()}
          onInsert={vi.fn()}
          onEditAttribution={vi.fn()}
        />
      );
      return screen
        .getByRole('button', { name: `Delete image ${image.title}` })
        .closest('li') as HTMLElement;
    };

    it('renders the license badge as a link when a licenseUrl is present', () => {
      const tile = renderTile(
        buildImage({
          license: 'CC BY-SA 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        })
      );
      const link = within(tile).getByRole('link', { name: /CC BY-SA 4\.0/ });
      expect(link).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
    });

    it('opens the license link in a new tab safely', () => {
      const tile = renderTile(
        buildImage({
          license: 'CC BY-SA 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        })
      );
      const link = within(tile).getByRole('link', { name: /CC BY-SA 4\.0/ });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders a plain license badge (no link) when only the license name is present', () => {
      const tile = renderTile(buildImage({ license: 'Public domain', licenseUrl: null }));
      expect(within(tile).getByText('Public domain')).toBeInTheDocument();
      expect(within(tile).queryByRole('link')).not.toBeInTheDocument();
    });

    it('renders "Rights unknown" when neither license nor licenseUrl is present', () => {
      const tile = renderTile(buildImage({ license: null, licenseUrl: null }));
      expect(within(tile).getByText('Rights unknown')).toBeInTheDocument();
    });

    it('does not render "Rights unknown" when a license name is present', () => {
      const tile = renderTile(buildImage({ license: 'Public domain', licenseUrl: null }));
      expect(within(tile).queryByText('Rights unknown')).not.toBeInTheDocument();
    });
  });
});
