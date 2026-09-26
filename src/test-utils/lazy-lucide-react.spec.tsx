/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render } from '@testing-library/react';

import { createLazyLucideReact } from './lazy-lucide-react';

import type * as LucideReact from 'lucide-react';

type RealLucide = typeof LucideReact;

describe('createLazyLucideReact', () => {
  it('renders the same SVG as the real icon', async () => {
    const { Search: RealSearch } = await vi.importActual<RealLucide>('lucide-react');
    const { Search } = createLazyLucideReact();

    const real = render(<RealSearch className="x" />).container.innerHTML;
    const lazy = render(<Search className="x" />).container.innerHTML;

    expect(lazy).toBe(real);
  });

  it('renders a single-element icon (emitted on one line) like the real one', async () => {
    const { LoaderCircle: RealLoader } = await vi.importActual<RealLucide>('lucide-react');
    const { LoaderCircle } = createLazyLucideReact();

    const real = render(<RealLoader />).container.innerHTML;
    const lazy = render(<LoaderCircle />).container.innerHTML;

    expect(lazy).toBe(real);
  });

  it('resolves every alias of an icon to one component', () => {
    const lazy = createLazyLucideReact();

    expect(lazy.SearchIcon).toBe(lazy.Search);
    expect(lazy.LucideSearch).toBe(lazy.Search);
  });

  it('keeps a stable component identity across reads', () => {
    const lazy = createLazyLucideReact();

    expect(lazy.Search).toBe(lazy.Search);
  });

  it('reports unknown names as absent so a bad import fails loudly', () => {
    const lazy = createLazyLucideReact();

    expect('Search' in lazy).toBe(true);
    expect('NotAnIcon' in lazy).toBe(false);
    expect(lazy.NotAnIcon).toBeUndefined();
  });

  it('is not thenable, so awaiting the mocked module does not hang', () => {
    const lazy = createLazyLucideReact();

    expect((lazy as { then?: unknown }).then).toBeUndefined();
  });
});
