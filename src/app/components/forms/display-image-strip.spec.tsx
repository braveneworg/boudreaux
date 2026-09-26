/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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
    ...overrides,
  };
  render(<DisplayImageStrip {...props} />);
  return props;
};

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

  it('shows the count against the cap', () => {
    renderStrip();
    expect(screen.getByRole('heading', { name: 'Display images (3/3)' })).toBeInTheDocument();
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

  it('labels an untitled image "image"', () => {
    renderStrip({ images: [{ ...IMAGES[0], title: null, alt: null }] });
    expect(
      screen.getByRole('button', { name: 'Remove image from display images' })
    ).toBeInTheDocument();
  });
});
