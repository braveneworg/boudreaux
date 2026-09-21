/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SearchComboboxTrigger, ZINE_SEARCH_FIELD_CLASS } from './search-combobox-trigger';

describe('SearchComboboxTrigger', () => {
  it('renders a labelled button showing its label', () => {
    render(<SearchComboboxTrigger aria-label="Search things" label="Search by name" />);

    expect(screen.getByRole('button', { name: 'Search things' })).toHaveTextContent(
      'Search by name'
    );
  });

  it('never submits a surrounding form', () => {
    render(<SearchComboboxTrigger aria-label="Search things" label="Search by name" />);

    expect(screen.getByRole('button', { name: 'Search things' })).toHaveAttribute('type', 'button');
  });

  it('wears the punk-zine box: hard black border, paper fill and ink offset', () => {
    render(<SearchComboboxTrigger aria-label="Search things" label="Search by name" />);

    expect(screen.getByRole('button', { name: 'Search things' })).toHaveClass(
      'border-2',
      'border-black',
      'shadow-zine-ink',
      'bg-zinc-50'
    );
  });

  it('shows its label in full ink', () => {
    render(<SearchComboboxTrigger aria-label="Search things" label="Search by name" />);

    expect(screen.getByRole('button', { name: 'Search things' })).toHaveClass('text-zinc-950');
  });

  it('rings in the accent of the panel around it on focus and while open', () => {
    render(<SearchComboboxTrigger aria-label="Search things" label="Search by name" />);

    expect(screen.getByRole('button', { name: 'Search things' })).toHaveClass(
      'focus-visible:ring-(--card-accent)',
      'data-[state=open]:ring-(--card-accent)'
    );
  });

  it('draws the search icon in bold black ink', () => {
    const { container } = render(
      <SearchComboboxTrigger aria-label="Search things" label="Search by name" />
    );

    const icon = container.querySelector('svg');
    expect(icon).toHaveClass('text-black');
    expect(icon).toHaveAttribute('stroke-width', '2.5');
  });

  it('merges a caller className', () => {
    render(
      <SearchComboboxTrigger aria-label="Search things" label="Search by name" className="mx-4" />
    );

    expect(screen.getByRole('button', { name: 'Search things' })).toHaveClass('mx-4', 'border-2');
  });

  it('forwards button props, so a popover can drive it as its trigger', () => {
    render(
      <SearchComboboxTrigger
        aria-label="Search things"
        label="Search by name"
        aria-expanded
        data-state="open"
      />
    );

    const trigger = screen.getByRole('button', { name: 'Search things' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('data-state', 'open');
  });

  it('fires onClick', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <SearchComboboxTrigger aria-label="Search things" label="Search by name" onClick={onClick} />
    );

    await user.click(screen.getByRole('button', { name: 'Search things' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('ZINE_SEARCH_FIELD_CLASS', () => {
  it('carries the same box and accent ring for an inline search field', () => {
    expect(ZINE_SEARCH_FIELD_CLASS.split(' ')).toEqual(
      expect.arrayContaining([
        'border-2',
        'border-black',
        'bg-zinc-50',
        'shadow-zine-ink',
        'focus-within:ring-[3px]',
        'focus-within:ring-(--card-accent)',
      ])
    );
  });
});
