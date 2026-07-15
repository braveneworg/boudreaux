/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ComponentProps } from 'react';

import { render, screen } from '@testing-library/react';

import { PlaylistCoverTiles } from './playlist-cover-tiles';

// Mock next/image using <span> to avoid the @next/next/no-img-element lint rule,
// surfacing every forwarded prop (including aria-hidden) as data-/attributes.
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    <span
      aria-hidden={props['aria-hidden'] as boolean | undefined}
      className={props.className as string | undefined}
      data-alt={props.alt as string}
      data-fill={props.fill ? 'true' : 'false'}
      data-sizes={props.sizes as string}
      data-src={props.src as string}
      data-testid="next-image"
    />
  ),
}));

const covers = [
  'https://cdn.example.com/cover-1.jpg',
  'https://cdn.example.com/cover-2.jpg',
  'https://cdn.example.com/cover-3.jpg',
  'https://cdn.example.com/cover-4.jpg',
  'https://cdn.example.com/cover-5.jpg',
];

const renderTiles = (
  count: number,
  props: Partial<ComponentProps<typeof PlaylistCoverTiles>> = {}
): Element | null => {
  const { container } = render(
    <PlaylistCoverTiles images={covers.slice(0, count)} alt="Road mix cover" {...props} />
  );
  return container.firstElementChild;
};

describe('PlaylistCoverTiles', () => {
  describe('image counts', () => {
    it('renders a placeholder and no images when images is empty', () => {
      renderTiles(0);

      expect(screen.queryByTestId('next-image')).not.toBeInTheDocument();
      expect(screen.getByTestId('playlist-cover-placeholder')).toBeInTheDocument();
    });

    it('renders one image for one cover', () => {
      renderTiles(1);

      expect(screen.getAllByTestId('next-image')).toHaveLength(1);
    });

    it('renders two images for two covers', () => {
      renderTiles(2);

      expect(screen.getAllByTestId('next-image')).toHaveLength(2);
    });

    it('renders three images for three covers', () => {
      renderTiles(3);

      expect(screen.getAllByTestId('next-image')).toHaveLength(3);
    });

    it('renders four images for four covers', () => {
      renderTiles(4);

      expect(screen.getAllByTestId('next-image')).toHaveLength(4);
    });

    it('slices to the first four images when given more', () => {
      renderTiles(5);

      const images = screen.getAllByTestId('next-image');
      expect(images).toHaveLength(4);
      expect(images[3]).toHaveAttribute('data-src', covers[3]);
    });
  });

  describe('placeholder', () => {
    it('paints the placeholder neutral zinc', () => {
      renderTiles(0);

      expect(screen.getByTestId('playlist-cover-placeholder')).toHaveClass('bg-zinc-200');
    });

    it('shows the Music icon inside the placeholder', () => {
      renderTiles(0);

      const placeholder = screen.getByTestId('playlist-cover-placeholder');
      expect(placeholder.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('tile layout', () => {
    it('applies no column split for a single cover', () => {
      const frame = renderTiles(1);

      expect(frame).not.toHaveClass('grid-cols-2');
    });

    it('splits two covers into a two-column grid', () => {
      const frame = renderTiles(2);

      expect(frame).toHaveClass('grid', 'grid-cols-2');
      expect(frame).not.toHaveClass('grid-rows-2');
    });

    it('lays out three covers on a 2x2 grid', () => {
      const frame = renderTiles(3);

      expect(frame).toHaveClass('grid', 'grid-cols-2', 'grid-rows-2');
    });

    it('spans the first of three covers across both rows', () => {
      const frame = renderTiles(3);

      const cells = Array.from(frame?.children ?? []);
      expect(cells[0]).toHaveClass('row-span-2');
      expect(cells[1]).not.toHaveClass('row-span-2');
      expect(cells[2]).not.toHaveClass('row-span-2');
    });

    it('lays out four covers on a 2x2 grid without row spans', () => {
      const frame = renderTiles(4);

      expect(frame).toHaveClass('grid', 'grid-cols-2', 'grid-rows-2');
      expect(frame?.querySelector('.row-span-2')).toBeNull();
    });

    it('renders tiles as fill images inside relative cells', () => {
      const frame = renderTiles(2);

      const cells = Array.from(frame?.children ?? []);
      expect(cells[0]).toHaveClass('relative');
      expect(cells[1]).toHaveClass('relative');
      expect(screen.getAllByTestId('next-image')[0]).toHaveAttribute('data-fill', 'true');
    });

    it('clips every tile with object-cover', () => {
      renderTiles(4);

      for (const image of screen.getAllByTestId('next-image')) {
        expect(image).toHaveClass('object-cover');
      }
    });
  });

  describe('accessibility', () => {
    it('labels only the first tile with the alt text', () => {
      renderTiles(3);

      const images = screen.getAllByTestId('next-image');
      expect(images[0]).toHaveAttribute('data-alt', 'Road mix cover');
      expect(images[0]).not.toHaveAttribute('aria-hidden');
    });

    it('hides the remaining tiles from assistive tech', () => {
      renderTiles(3);

      const images = screen.getAllByTestId('next-image');
      expect(images[1]).toHaveAttribute('data-alt', '');
      expect(images[1]).toHaveAttribute('aria-hidden', 'true');
      expect(images[2]).toHaveAttribute('data-alt', '');
      expect(images[2]).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('frame variants', () => {
    it('renders the zine frame at thumb size by default', () => {
      const frame = renderTiles(1);

      expect(frame).toHaveClass(
        'aspect-square',
        'border-2',
        'border-black',
        'overflow-hidden',
        'size-14'
      );
    });

    it('fills the container width for the lg variant', () => {
      const frame = renderTiles(1, { size: 'lg' });

      expect(frame).toHaveClass('w-full', 'aspect-square', 'border-2', 'border-black');
      expect(frame).not.toHaveClass('size-14');
    });

    it('merges a passed className onto the frame', () => {
      const frame = renderTiles(1, { className: 'shadow-zine-sm' });

      expect(frame).toHaveClass('shadow-zine-sm', 'border-2');
    });

    it('requests thumb-sized images for the sm variant', () => {
      renderTiles(1);

      expect(screen.getByTestId('next-image')).toHaveAttribute('data-sizes', '56px');
    });

    it('requests viewport-sized images for the lg variant', () => {
      renderTiles(1, { size: 'lg' });

      expect(screen.getByTestId('next-image')).toHaveAttribute(
        'data-sizes',
        '(max-width: 640px) 100vw, 512px'
      );
    });
  });
});
