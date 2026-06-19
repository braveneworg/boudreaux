/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { ReleaseCombobox } from './release-combobox';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="next-image" data-src={src} data-alt={alt} />
  ),
}));

const releases = [
  { id: 'r1', title: 'First Album', coverArtSrc: 'https://example.com/r1.jpg' },
  { id: 'r2', title: 'Second Album', coverArtSrc: null },
];

describe('ReleaseCombobox', () => {
  it('shows the selected release title in the trigger', () => {
    render(<ReleaseCombobox releases={releases} selectedId="r2" onSelect={vi.fn()} />);

    expect(screen.getByRole('combobox')).toHaveTextContent('Second Album');
  });

  it('exposes the provided aria-label on the trigger', () => {
    render(
      <ReleaseCombobox
        releases={releases}
        selectedId="r1"
        onSelect={vi.fn()}
        ariaLabel="Select a release by Test Artist"
      />
    );

    expect(
      screen.getByRole('combobox', { name: 'Select a release by Test Artist' })
    ).toBeInTheDocument();
  });

  it('falls back to the first release when the selected id is unknown', () => {
    render(<ReleaseCombobox releases={releases} selectedId="missing" onSelect={vi.fn()} />);

    expect(screen.getByRole('combobox')).toHaveTextContent('First Album');
  });

  it('renders a fallback initial when the selected release has no cover art', () => {
    render(<ReleaseCombobox releases={releases} selectedId="r2" onSelect={vi.fn()} />);

    // "S" from "Second Album"; the image span is only rendered for r1's cover.
    expect(screen.getByRole('combobox')).toHaveTextContent('S');
    expect(screen.queryByTestId('next-image')).not.toBeInTheDocument();
  });
});
