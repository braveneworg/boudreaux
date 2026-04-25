/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { BANNER_ASPECT_PADDING, BANNER_SLOTS } from '@/lib/constants/banner-slots';
import { IMAGE_VARIANT_DEVICE_SIZES } from '@/lib/constants/image-variants';

import HomeLoading from './loading';

describe('HomeLoading', () => {
  it('renders the LCP banner with high fetch priority', () => {
    render(<HomeLoading />);
    const img = screen.getByTestId('lcp-banner-img');

    expect(img).toHaveAttribute('fetchpriority', 'high');
    expect(img).toHaveAttribute('decoding', 'async');
    expect(img).toHaveAttribute('sizes', '100vw');
  });

  it('builds the LCP image src from the first banner slot', () => {
    render(<HomeLoading />);
    const img = screen.getByTestId('lcp-banner-img');
    const expectedFilenameFragment = encodeURIComponent(BANNER_SLOTS[0].filename).replace(
      /\.webp$/,
      ''
    );

    const srcset = img.getAttribute('srcset');
    const firstSize = IMAGE_VARIANT_DEVICE_SIZES[0];
    const lastSize = IMAGE_VARIANT_DEVICE_SIZES[IMAGE_VARIANT_DEVICE_SIZES.length - 1];

    expect(img.getAttribute('src')).toContain(expectedFilenameFragment);
    expect(srcset).toContain(`${firstSize}w`);
    expect(srcset).toContain(`${lastSize}w`);
  });

  it('reserves banner space using the shared aspect-ratio constant', () => {
    render(<HomeLoading />);
    const wrapper = screen.getByTestId('lcp-banner-img').parentElement;

    expect(wrapper).toHaveStyle({ paddingBottom: BANNER_ASPECT_PADDING });
  });
});
