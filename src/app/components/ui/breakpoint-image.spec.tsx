// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createElement } from 'react';

import { render, screen } from '@testing-library/react';

import { BLANK_IMAGE_DATA_URI, BreakpointImage } from './breakpoint-image';

// Render next/image as a plain <img> that forwards the DOM-safe props.
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    sizes,
    loading,
    fetchPriority,
    className,
  }: {
    src: string;
    alt: string;
    sizes?: string;
    loading?: string;
    fetchPriority?: string;
    className?: string;
  }) => createElement('img', { src, alt, sizes, loading, fetchpriority: fetchPriority, className }),
}));

describe('BreakpointImage', () => {
  it('puts a blank candidate first for the breakpoint that hides the image, so nothing is fetched there', () => {
    const { container } = render(
      <BreakpointImage hiddenMedia="(max-width: 767.98px)" src="/media/x.jpg" alt="x" fill />
    );

    const source = container.querySelector('picture > source');
    expect(source).toHaveAttribute('media', '(max-width: 767.98px)');
    expect(source).toHaveAttribute('srcset', BLANK_IMAGE_DATA_URI);
    expect(source?.nextElementSibling).toBe(screen.getByAltText('x'));
  });

  it('is a 1×1 transparent GIF data URI, so the blank candidate costs no request', () => {
    expect(BLANK_IMAGE_DATA_URI).toMatch(/^data:image\/gif;base64,/);
  });

  it('forwards the loading hints to the underlying image', () => {
    render(
      <BreakpointImage
        hiddenMedia="(min-width: 768px)"
        src="/media/x.jpg"
        alt="x"
        fill
        sizes="100vw"
        loading="eager"
        fetchPriority="high"
        className="object-cover"
      />
    );

    const img = screen.getByAltText('x');
    expect(img).toHaveAttribute('sizes', '100vw');
    expect(img).toHaveAttribute('loading', 'eager');
    expect(img).toHaveAttribute('fetchpriority', 'high');
    expect(img).toHaveClass('object-cover');
  });

  it('keeps the picture out of layout so a fill image still sizes to the positioned ancestor', () => {
    const { container } = render(
      <BreakpointImage hiddenMedia="(min-width: 768px)" src="/media/x.jpg" alt="x" fill />
    );

    expect(container.querySelector('picture')).toHaveClass('contents');
  });
});
