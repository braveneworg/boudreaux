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

vi.mock('@/lib/utils/api-base-url', () => ({
  getApiBaseUrl: () => 'https://fakefourrecords.com',
}));

const FIGURE_HTML_LEFT =
  '<figure class="bio-figure bio-figure--left" style="width:45%">' +
  '<img src="https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg" alt="p" width="800" height="600">' +
  '</figure>';

const FIGURE_HTML_RIGHT =
  '<figure class="bio-figure bio-figure--right" style="width:45%">' +
  '<img src="https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg" alt="p" width="800" height="600">' +
  '</figure>';

const FIGURE_HTML_BARE =
  '<figure class="bio-figure">' +
  '<img src="https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg" alt="p" width="800" height="600">' +
  '</figure>';

const FIGURE_HTML_WITH_CAPTION =
  '<figure class="bio-figure bio-figure--center" style="width:60%">' +
  '<img src="https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg" alt="p" width="800" height="600">' +
  '<figcaption class="bio-figure-caption">' +
  '<span class="bio-figure-title">T</span>' +
  '<span class="bio-figure-attribution">By A</span>' +
  '</figcaption>' +
  '</figure>';

describe('BioHtml', () => {
  it('renders an anchor as a Next link with the href preserved', () => {
    render(<BioHtml html='<p>See <a href="https://radiohead.com">site</a>.</p>' />);

    expect(screen.getByRole('link', { name: 'site' })).toHaveAttribute(
      'href',
      'https://radiohead.com'
    );
  });

  it('forces rel="nofollow noopener noreferrer" on external links', () => {
    render(<BioHtml html='<a href="https://example.com">x</a>' />);

    expect(screen.getByRole('link', { name: 'x' })).toHaveAttribute(
      'rel',
      'nofollow noopener noreferrer'
    );
  });

  it('keeps the external icon and new-tab attributes on external links', () => {
    render(<BioHtml html='<a href="https://en.wikipedia.org/wiki/X">X</a>' />);

    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute('target', '_blank');
  });

  it('renders an internal link same-tab without a target attribute', () => {
    render(<BioHtml html='<p><a href="/releases/665f">Album</a></p>' />);

    const link = screen.getByRole('link', { name: 'Album' });
    expect(link).not.toHaveAttribute('target');
  });

  it('renders an internal link without rel hardening', () => {
    render(<BioHtml html='<p><a href="/releases/665f">Album</a></p>' />);

    expect(screen.getByRole('link', { name: 'Album' })).not.toHaveAttribute('rel');
  });

  it('renders an internal link without the external icon', () => {
    render(<BioHtml html='<p><a href="/releases/665f">Album</a></p>' />);

    expect(
      screen.getByRole('link', { name: 'Album' }).querySelector('svg')
    ).not.toBeInTheDocument();
  });

  it('treats an absolute same-origin URL as internal', () => {
    render(<BioHtml html='<a href="https://www.fakefourrecords.com/releases/665f">Album</a>' />);

    expect(screen.getByRole('link', { name: 'Album' })).not.toHaveAttribute('target');
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

  it('appends a trailing open-in-new-tab icon to external links without changing their name', () => {
    render(<BioHtml html='<a href="https://example.com">Wikipedia</a>' />);

    const link = screen.getByRole('link', { name: 'Wikipedia' });
    expect(link.querySelector('svg')).toBeInTheDocument();
  });

  it('renders section headings as native heading elements', () => {
    render(<BioHtml html="<h2>Career</h2><h3>Early years</h3><p>bio</p>" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Career' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Early years' })).toBeInTheDocument();
  });

  it('renders an anchor without an href as plain text', () => {
    render(<BioHtml html="<a>no href</a>" />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('no href')).toBeInTheDocument();
  });

  it('renders a left-floated figure with the static float class', () => {
    render(<BioHtml html={FIGURE_HTML_LEFT} />);

    const figure = screen.getByRole('figure');
    expect(figure.className).toContain('float-left');
  });

  it('renders a right-floated figure with the static float class', () => {
    render(<BioHtml html={FIGURE_HTML_RIGHT} />);

    const figure = screen.getByRole('figure');
    expect(figure.className).toContain('float-right');
  });

  it('falls back to the centered layout when no float class is present', () => {
    render(<BioHtml html={FIGURE_HTML_BARE} />);

    const figure = screen.getByRole('figure');
    expect(figure.className).toContain('mx-auto');
  });

  it('applies the persisted percentage width to the figure', () => {
    render(<BioHtml html={FIGURE_HTML_LEFT} />);

    expect(screen.getByRole('figure')).toHaveStyle({ width: '45%' });
  });

  it('omits the inline width when the figure has no width style', () => {
    render(<BioHtml html={FIGURE_HTML_BARE} />);

    expect(screen.getByRole('figure')).not.toHaveAttribute('style');
  });

  it('renders the figure image through Next Image', () => {
    render(<BioHtml html={FIGURE_HTML_LEFT} />);

    expect(screen.getByTestId('next-image')).toHaveAttribute(
      'data-src',
      'https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg'
    );
  });

  it('renders the caption at the 11px floor', () => {
    render(<BioHtml html={FIGURE_HTML_WITH_CAPTION} />);

    const caption = screen.getByText('T').closest('figcaption');
    expect(caption?.className).toContain('text-[11px]');
  });

  it('ignores a max-width declaration when parsing the figure width', () => {
    const html =
      '<figure class="bio-figure bio-figure--left" style="max-width:45%">' +
      '<img src="https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg" alt="p" width="800" height="600">' +
      '</figure>';
    render(<BioHtml html={html} />);

    expect(screen.getByRole('figure')).not.toHaveAttribute('style');
  });

  it('still parses a width declaration that follows another declaration', () => {
    const html =
      '<figure class="bio-figure bio-figure--left" style="margin:0; width:45%">' +
      '<img src="https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg" alt="p" width="800" height="600">' +
      '</figure>';
    render(<BioHtml html={html} />);

    expect(screen.getByRole('figure')).toHaveStyle({ width: '45%' });
  });

  it('never carries an inline style onto the rendered figcaption', () => {
    const html =
      '<figure class="bio-figure bio-figure--center" style="width:60%">' +
      '<img src="https://cdn.fakefourrecords.com/media/artists/a/bio/0.jpg" alt="p" width="800" height="600">' +
      '<figcaption class="bio-figure-caption" style="font-size:30px">' +
      '<span class="bio-figure-title">T</span>' +
      '</figcaption>' +
      '</figure>';
    render(<BioHtml html={html} />);

    const caption = screen.getByText('T').closest('figcaption');
    expect(caption).not.toHaveAttribute('style');
  });

  it('keeps the caption span content intact', () => {
    render(<BioHtml html={FIGURE_HTML_WITH_CAPTION} />);

    expect(screen.getByText('By A')).toBeInTheDocument();
  });
});
