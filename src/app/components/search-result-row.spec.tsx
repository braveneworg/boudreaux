/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { SearchResultRow } from './search-result-row';

describe('SearchResultRow', () => {
  it('renders the thumbnail it is given', () => {
    render(<SearchResultRow thumbnail={<span data-testid="thumb" />} primary="Ceschi" />);

    expect(screen.getByTestId('thumb')).toBeInTheDocument();
  });

  it('renders the primary line in medium weight', () => {
    render(<SearchResultRow thumbnail={null} primary="Ceschi" />);

    expect(screen.getByText('Ceschi')).toHaveClass('truncate', 'text-sm', 'font-medium');
  });

  it('renders the secondary line small and muted', () => {
    render(<SearchResultRow thumbnail={null} primary="Ceschi" secondary="Broken Bone Ballads" />);

    expect(screen.getByText('Broken Bone Ballads')).toHaveClass(
      'truncate',
      'text-xs',
      'text-zinc-500'
    );
  });

  it('omits the secondary line when there is none', () => {
    const { container } = render(<SearchResultRow thumbnail={null} primary="Ceschi" />);

    expect(container.querySelector('.text-xs')).toBeNull();
  });

  it('renders a trailing element after the text', () => {
    render(
      <SearchResultRow thumbnail={null} primary="Ceschi" trailing={<span data-testid="plus" />} />
    );

    expect(screen.getByTestId('plus')).toBeInTheDocument();
  });
});
