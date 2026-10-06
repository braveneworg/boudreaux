/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BIO_IMAGE_DRAG_MIME } from '@/lib/validation/bio-dnd-schema';
import type { BioStatusImage } from '@/lib/validation/bio-generation-schema';

import { DisplayImageStrip, type DisplayImageStripProps } from './display-image-strip';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="strip-image" data-src={src} data-alt={alt} />
  ),
}));

const image = (id: string, title: string): BioStatusImage => ({
  id,
  url: `https://cdn.example/${id}.webp`,
  thumbnailUrl: `https://cdn.example/${id}-thumb.webp`,
  title,
  attribution: null,
  isPrimary: false,
  displayOrder: null,
  alt: `${title} on stage`,
});

const IMAGES = [image('a', 'Alpha'), image('b', 'Bravo'), image('c', 'Charlie')];

const renderStrip = (overrides: Partial<DisplayImageStripProps> = {}) => {
  const props: DisplayImageStripProps = {
    images: IMAGES,
    onReorder: vi.fn(),
    onRemove: vi.fn(),
    onDropPoolImage: vi.fn(),
    onDropFile: vi.fn(),
    ...overrides,
  };
  render(<DisplayImageStrip {...props} />);
  return props;
};

const dropTarget = () => screen.getByRole('group', { name: 'Add a display image' });

/** A pool tile's drag payload, as `BioImageTile` sets it. */
const poolPayload = (id: string): string =>
  JSON.stringify({
    id,
    url: `https://cdn.example/${id}.webp`,
    thumbnailUrl: null,
    title: id,
    attribution: null,
    alt: `${id} described`,
    width: null,
    height: null,
  });

/** A DataTransfer stand-in carrying either a pool payload or files. */
const transfer = ({ payload, files = [] }: { payload?: string; files?: File[] }) => ({
  types: [...(payload ? [BIO_IMAGE_DRAG_MIME] : []), ...(files.length ? ['Files'] : [])],
  getData: (type: string) => (type === BIO_IMAGE_DRAG_MIME ? (payload ?? '') : ''),
  files,
});

const jpeg = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });

describe('DisplayImageStrip', () => {
  it('renders the chosen images in order with their positions', () => {
    renderStrip();
    const items = within(screen.getByRole('list', { name: 'Display images' })).getAllByRole(
      'listitem'
    );
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Alpha, display image 1 of 3',
      'Bravo, display image 2 of 3',
      'Charlie, display image 3 of 3',
    ]);
  });

  it('shows the count with no cap', () => {
    renderStrip();
    expect(screen.getByRole('heading', { name: 'Display images (3)' })).toBeInTheDocument();
  });

  it('renders the thumbnail with the image alt text', () => {
    renderStrip({ images: [IMAGES[0]] });
    expect(screen.getByTestId('strip-image')).toHaveAttribute('data-alt', 'Alpha on stage');
    expect(screen.getByTestId('strip-image')).toHaveAttribute(
      'data-src',
      'https://cdn.example/a-thumb.webp'
    );
  });

  // Mirrors every tier of `resolveDisplayImages`: chosen → suggested → the
  // first pool rows. The copy once stopped at "suggested", so an admin with
  // no suggested rows read "nothing is shown" while the page showed images.
  it('explains every fallback tier when nothing is chosen', () => {
    renderStrip({ images: [] });
    expect(
      screen.getByText(
        'No display images chosen — the artist page shows the suggested images that have alt text, or else the first pool images that have alt text. They are marked Shown in the pool below.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Display images' })).not.toBeInTheDocument();
  });

  it('moves an image earlier and reports the whole new order', async () => {
    const { onReorder } = renderStrip();
    await userEvent.click(screen.getByRole('button', { name: 'Move Bravo earlier' }));
    expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c']);
  });

  it('moves an image later and reports the whole new order', async () => {
    const { onReorder } = renderStrip();
    await userEvent.click(screen.getByRole('button', { name: 'Move Bravo later' }));
    expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'b']);
  });

  it('disables moving the first image earlier and the last image later', () => {
    renderStrip();
    expect(screen.getByRole('button', { name: 'Move Alpha earlier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Charlie later' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Alpha later' })).toBeEnabled();
  });

  it('removes an image from the set', async () => {
    const { onRemove } = renderStrip();
    await userEvent.click(screen.getByRole('button', { name: 'Remove Bravo from display images' }));
    expect(onRemove).toHaveBeenCalledWith('b');
  });

  it('moves the image with the arrow keys while a move button has focus', async () => {
    const { onReorder } = renderStrip();
    screen.getByRole('button', { name: 'Move Bravo later' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'b']);
    await userEvent.keyboard('{ArrowLeft}');
    expect(onReorder).toHaveBeenLastCalledWith(['b', 'a', 'c']);
  });

  it('moves the image with the arrow keys while the earlier button has focus too', async () => {
    const { onReorder } = renderStrip();
    screen.getByRole('button', { name: 'Move Charlie earlier' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(onReorder).toHaveBeenCalledWith(['a', 'c', 'b']);
  });

  it('ignores an arrow key at the edge', async () => {
    const { onReorder } = renderStrip();
    screen.getByRole('button', { name: 'Move Alpha later' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('announces the new position politely after a move', async () => {
    renderStrip();
    await userEvent.click(screen.getByRole('button', { name: 'Move Bravo later' }));
    expect(screen.getByText('Bravo is now display image 3 of 3')).toHaveAttribute(
      'aria-live',
      'polite'
    );
  });

  it('disables every control when disabled', () => {
    renderStrip({ disabled: true });
    expect(screen.getByRole('button', { name: 'Move Alpha later' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Bravo earlier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove Alpha from display images' })).toBeDisabled();
  });

  describe('drop target', () => {
    it('invites a pool image or an image file while there is room', () => {
      renderStrip({ images: IMAGES.slice(0, 2) });
      expect(dropTarget()).toHaveTextContent(/Drop a pool image or an image file here/);
    });

    it('adds a dropped pool image by its id', () => {
      const { onDropPoolImage, onDropFile } = renderStrip({ images: IMAGES.slice(0, 2) });

      fireEvent.drop(dropTarget(), { dataTransfer: transfer({ payload: poolPayload('d') }) });

      expect(vi.mocked(onDropPoolImage).mock.calls).toEqual([['d']]);
      expect(onDropFile).not.toHaveBeenCalled();
    });

    it('hands over the first dropped image file', () => {
      const png = new File(['y'], 'other.png', { type: 'image/png' });
      const { onDropPoolImage, onDropFile } = renderStrip({ images: IMAGES.slice(0, 2) });

      fireEvent.drop(dropTarget(), { dataTransfer: transfer({ files: [jpeg, png] }) });

      expect(vi.mocked(onDropFile).mock.calls).toEqual([[jpeg]]);
      expect(onDropPoolImage).not.toHaveBeenCalled();
    });

    it('ignores a pool payload without an id', () => {
      const { onDropPoolImage, onDropFile } = renderStrip({ images: IMAGES.slice(0, 2) });
      const payload = JSON.stringify({ ...JSON.parse(poolPayload('d')), id: undefined });

      fireEvent.drop(dropTarget(), { dataTransfer: transfer({ payload }) });

      expect(onDropPoolImage).not.toHaveBeenCalled();
      expect(onDropFile).not.toHaveBeenCalled();
    });

    it('ignores a drop that carries neither a pool image nor a file', () => {
      const { onDropPoolImage, onDropFile } = renderStrip({ images: IMAGES.slice(0, 2) });

      fireEvent.drop(dropTarget(), { dataTransfer: transfer({}) });

      expect(onDropPoolImage).not.toHaveBeenCalled();
      expect(onDropFile).not.toHaveBeenCalled();
    });

    it('highlights while something drags over it and clears on leave', () => {
      renderStrip({ images: IMAGES.slice(0, 2) });

      fireEvent.dragOver(dropTarget(), { dataTransfer: transfer({ files: [jpeg] }) });
      expect(dropTarget()).toHaveAttribute('data-drag-over', 'true');
      fireEvent.dragLeave(dropTarget(), { dataTransfer: transfer({ files: [jpeg] }) });
      expect(dropTarget()).toHaveAttribute('data-drag-over', 'false');
    });

    it('keeps accepting drops past three — the set has no cap', () => {
      const { onDropPoolImage, onDropFile } = renderStrip();
      expect(dropTarget()).not.toHaveTextContent(/limit/);

      fireEvent.drop(dropTarget(), { dataTransfer: transfer({ payload: poolPayload('d') }) });
      fireEvent.drop(dropTarget(), { dataTransfer: transfer({ files: [jpeg] }) });

      expect(onDropPoolImage).toHaveBeenCalledWith('d');
      expect(onDropFile).toHaveBeenCalledWith(jpeg);
    });

    it('refuses drops while disabled', () => {
      const { onDropPoolImage, onDropFile } = renderStrip({
        images: IMAGES.slice(0, 1),
        disabled: true,
      });

      fireEvent.drop(dropTarget(), { dataTransfer: transfer({ payload: poolPayload('d') }) });
      fireEvent.drop(dropTarget(), { dataTransfer: transfer({ files: [jpeg] }) });

      expect(onDropPoolImage).not.toHaveBeenCalled();
      expect(onDropFile).not.toHaveBeenCalled();
    });

    it('refuses a second file while one is still uploading, and says so', () => {
      const { onDropFile } = renderStrip({ images: IMAGES.slice(0, 1), isUploading: true });
      expect(screen.getByRole('status')).toHaveTextContent('Uploading');

      fireEvent.drop(dropTarget(), { dataTransfer: transfer({ files: [jpeg] }) });

      expect(onDropFile).not.toHaveBeenCalled();
    });

    it('shows the upload failure inline', () => {
      renderStrip({ images: IMAGES.slice(0, 1), uploadError: 'S3 refused' });
      expect(screen.getByRole('alert')).toHaveTextContent('S3 refused');
    });
  });

  it('labels an untitled image "image"', () => {
    renderStrip({ images: [{ ...IMAGES[0], title: null, alt: null }] });
    expect(
      screen.getByRole('button', { name: 'Remove image from display images' })
    ).toBeInTheDocument();
  });
});
