/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { BioHtml } from './bio-html';

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
      data-testid="next-image"
      data-src={src}
      data-alt={alt}
      data-width={width}
      data-height={height}
    />
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    rel?: string;
    target?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('BioHtml', () => {
  it('renders an anchor as a Next link with the href preserved', () => {
    render(<BioHtml html='<p>See <a href="https://radiohead.com">site</a>.</p>' />);

    expect(screen.getByRole('link', { name: 'site' })).toHaveAttribute(
      'href',
      'https://radiohead.com'
    );
  });

  it('forces rel="nofollow noopener noreferrer" on rendered links', () => {
    render(<BioHtml html='<a href="https://example.com">x</a>' />);

    expect(screen.getByRole('link', { name: 'x' })).toHaveAttribute(
      'rel',
      'nofollow noopener noreferrer'
    );
  });

  it('forces target="_blank" on rendered links', () => {
    render(<BioHtml html='<a href="https://example.com">x</a>' />);

    expect(screen.getByRole('link', { name: 'x' })).toHaveAttribute('target', '_blank');
  });

  it('renders an image as a Next Image with its source', () => {
    render(
      <BioHtml html='<img src="https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg" alt="portrait" width="800" height="600">' />
    );

    expect(screen.getByTestId('next-image')).toHaveAttribute(
      'data-src',
      'https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg'
    );
  });

  it('passes the image width and height through to Next Image', () => {
    render(
      <BioHtml html='<img src="https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg" alt="p" width="800" height="600">' />
    );

    const image = screen.getByTestId('next-image');
    expect(image).toHaveAttribute('data-width', '800');
  });

  it('falls back to default dimensions when the image omits them', () => {
    render(
      <BioHtml html='<img src="https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg" alt="p">' />
    );

    expect(screen.getByTestId('next-image')).toHaveAttribute('data-width', '1200');
  });

  it('preserves non-mapped formatting tags', () => {
    render(<BioHtml html="<p><strong>Bold</strong> text</p>" />);

    expect(screen.getByText('Bold')).toBeInTheDocument();
  });

  it('renders an anchor without an href as plain text', () => {
    render(<BioHtml html="<a>no href</a>" />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('no href')).toBeInTheDocument();
  });
});
