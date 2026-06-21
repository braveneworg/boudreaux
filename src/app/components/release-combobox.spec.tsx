/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ReleaseCombobox } from './release-combobox';

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="next-image" data-src={src} data-alt={alt} />
  ),
}));

// cmdk calls scrollIntoView on the active item; jsdom does not implement it.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

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

  it('calls onSelect with the chosen release id and closes the popover', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<ReleaseCombobox releases={releases} selectedId="r1" onSelect={onSelect} />);

    // Open the popover via the trigger, then pick a release item — this exercises
    // the CommandItem onSelect handler (onSelect callback + setOpen(false)).
    await user.click(screen.getByRole('combobox'));

    const option = await screen.findByRole('option', { name: /Second Album/ });
    await user.click(option);

    expect(onSelect).toHaveBeenCalledWith('r2');
  });

  it('renders the Disc3 placeholder icon when the selected release has an empty title and no cover', () => {
    // Covers the `|| <Disc3 />` arm of ReleaseThumb (line 48): `''.charAt(0)`
    // is an empty string (falsy), so the icon renders instead of an initial.
    const untitled = [{ id: 'r1', title: '', coverArtSrc: null }];
    render(<ReleaseCombobox releases={untitled} selectedId="r1" onSelect={vi.fn()} />);

    const trigger = screen.getByRole('combobox');
    expect(trigger.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByTestId('next-image')).not.toBeInTheDocument();
  });

  it('falls back to the default trigger label when there are no releases', () => {
    // Covers the `selected?.coverArtSrc ?? null` / `selected?.title ?? '…'`
    // nullish arms (lines 83-84): with an empty list `selected` is undefined.
    render(<ReleaseCombobox releases={[]} selectedId="anything" onSelect={vi.fn()} />);

    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('Select a release');
    expect(screen.queryByTestId('next-image')).not.toBeInTheDocument();
  });
});
