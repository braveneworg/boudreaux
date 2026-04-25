/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render } from '@testing-library/react';

import { BANNER_ASPECT_PADDING, BANNER_SLOTS } from '@/lib/constants/banner-slots';

import HomeLoading from './loading';

describe('HomeLoading', () => {
  it('renders the LCP banner with high fetch priority', () => {
    const { container } = render(<HomeLoading />);
    const img = container.querySelector('img');

    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('fetchpriority', 'high');
    expect(img).toHaveAttribute('decoding', 'async');
    expect(img).toHaveAttribute('sizes', '100vw');
  });

  it('builds the LCP image src from the first banner slot', () => {
    const { container } = render(<HomeLoading />);
    const img = container.querySelector('img');
    const expectedFilenameFragment = encodeURIComponent(BANNER_SLOTS[0].filename).replace(
      /\.webp$/,
      ''
    );

    expect(img?.getAttribute('src')).toContain(expectedFilenameFragment);
    expect(img?.getAttribute('srcset')).toContain('640w');
    expect(img?.getAttribute('srcset')).toContain('1200w');
  });

  it('reserves banner space using the shared aspect-ratio constant', () => {
    const { container } = render(<HomeLoading />);
    const wrapper = container.querySelector('img')?.parentElement;

    expect(wrapper).toHaveStyle({ paddingBottom: BANNER_ASPECT_PADDING });
  });
});
