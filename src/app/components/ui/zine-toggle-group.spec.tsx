/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ZineToggleGroup, ZineToggleGroupItem } from './zine-toggle-group';

const renderPair = (onValueChange = vi.fn()): void => {
  render(
    <ZineToggleGroup type="single" value="a" onValueChange={onValueChange} aria-label="Sort">
      <ZineToggleGroupItem value="a">First</ZineToggleGroupItem>
      <ZineToggleGroupItem value="b">Second</ZineToggleGroupItem>
    </ZineToggleGroup>
  );
};

describe('ZineToggleGroup', () => {
  it('wraps the items in one hard black frame with an ink offset', () => {
    renderPair();

    expect(screen.getByRole('radiogroup', { name: 'Sort' })).toHaveClass(
      'shadow-zine-ink',
      'border-2',
      'border-black',
      'bg-zinc-50',
      'w-fit'
    );
  });

  it('does not use the outline variant hairlines or soft shadow', () => {
    renderPair();

    expect(screen.getByRole('radiogroup', { name: 'Sort' })).not.toHaveAttribute(
      'data-variant',
      'outline'
    );
  });

  it('merges a caller className onto the frame', () => {
    render(
      <ZineToggleGroup type="single" aria-label="Sort" className="shrink-0">
        <ZineToggleGroupItem value="a">First</ZineToggleGroupItem>
      </ZineToggleGroup>
    );

    expect(screen.getByRole('radiogroup', { name: 'Sort' })).toHaveClass(
      'shrink-0',
      'border-black'
    );
  });

  it('forwards selection changes', async () => {
    const onValueChange = vi.fn();
    renderPair(onValueChange);

    await userEvent.click(screen.getByRole('radio', { name: 'Second' }));

    expect(onValueChange).toHaveBeenCalledWith('b');
  });
});

describe('ZineToggleGroupItem', () => {
  it('sizes to its label instead of splitting the group evenly', () => {
    renderPair();

    const item = screen.getByRole('radio', { name: 'Second' });
    expect(item).toHaveClass('flex-none');
    expect(item).not.toHaveClass('flex-1');
  });

  it('sets the label in small uppercase tracked type', () => {
    renderPair();

    expect(screen.getByRole('radio', { name: 'First' })).toHaveClass(
      'text-xs',
      'font-semibold',
      'tracking-wider',
      'uppercase'
    );
  });

  it("fills the selected item with a lighter shade of the page's zine accent", () => {
    renderPair();

    expect(screen.getByRole('radio', { name: 'First' })).toHaveClass(
      'data-[state=on]:bg-(--card-accent-soft)',
      'data-[state=on]:text-black'
    );
    expect(screen.getByRole('radio', { name: 'First' })).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('radio', { name: 'First' })).not.toHaveClass(
      'data-[state=on]:bg-menu-item-pink-300'
    );
    expect(screen.getByRole('radio', { name: 'First' })).not.toHaveClass(
      'data-[state=on]:bg-(--card-accent)'
    );
  });

  it('draws the divider on every item after the first', () => {
    renderPair();

    expect(screen.getByRole('radio', { name: 'Second' })).toHaveClass(
      'not-first:border-l-2',
      'not-first:border-black'
    );
  });
});
