/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { BANNER_ASPECT_PADDING, BANNER_SLOTS } from '@/lib/constants/banner-slots';

import HomeLoading from './loading';

describe('HomeLoading', () => {
  it('renders the LCP banner with high fetch priority', () => {
    render(<HomeLoading />);
    const img = screen.getByTestId('lcp-banner-img');

    expect(img).toHaveAttribute('fetchpriority', 'high');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('uses a single fixed-width src for the Suspense fallback banner', () => {
    render(<HomeLoading />);
    const img = screen.getByTestId('lcp-banner-img');
    const expectedFilenameFragment = encodeURIComponent(BANNER_SLOTS[0].filename).replace(
      /\.webp$/,
      ''
    );

    expect(img.getAttribute('src')).toContain(expectedFilenameFragment);
    expect(img.getAttribute('src')).toContain('_w750.webp');
    // Intentionally no srcset/sizes on the Suspense fallback `<img>`. The
    // hydrated `BannerCarousel` uses Next/Image's responsive `priority`
    // preload, which emits matching `imagesrcset`/`imagesizes`. A
    // responsive fallback <img> here would let Chrome's preload picker
    // choose a variant that diverges from the hydrated <img>'s srcset.
    expect(img.getAttribute('srcset')).toBeNull();
    expect(img.getAttribute('sizes')).toBeNull();
  });

  it('reserves banner space using the shared aspect-ratio constant', () => {
    render(<HomeLoading />);
    const wrapper = screen.getByTestId('lcp-banner-img').parentElement;

    expect(wrapper).toHaveStyle({ paddingBottom: BANNER_ASPECT_PADDING });
  });
});
