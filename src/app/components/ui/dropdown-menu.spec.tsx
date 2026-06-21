/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu';

/**
 * Renders a fully composed menu (closed) that uses every sub-component wrapper.
 * Opening it via the trigger forces each wrapper function to execute.
 */
const ComposedMenu = () => (
  <DropdownMenu>
    <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuLabel inset>Account</DropdownMenuLabel>
      <DropdownMenuGroup>
        <DropdownMenuItem>Profile</DropdownMenuItem>
        <DropdownMenuItem inset variant="destructive">
          Delete
          <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuCheckboxItem checked>Show toolbar</DropdownMenuCheckboxItem>
      <DropdownMenuRadioGroup value="light">
        <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger inset>More</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem>Nested item</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuContent>
  </DropdownMenu>
);

describe('DropdownMenu', () => {
  it('renders the trigger with its data-slot', () => {
    render(<ComposedMenu />);

    expect(screen.getByText('Open menu')).toHaveAttribute('data-slot', 'dropdown-menu-trigger');
  });

  it('renders the menu content and items once opened', async () => {
    const user = userEvent.setup();
    render(<ComposedMenu />);

    await user.click(screen.getByText('Open menu'));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText('Profile')).toBeInTheDocument();
  });

  it('renders the inset label', async () => {
    const user = userEvent.setup();
    render(<ComposedMenu />);

    await user.click(screen.getByText('Open menu'));

    expect(await screen.findByText('Account')).toHaveAttribute('data-slot', 'dropdown-menu-label');
  });

  it('renders a destructive item with a shortcut', async () => {
    const user = userEvent.setup();
    render(<ComposedMenu />);

    await user.click(screen.getByText('Open menu'));

    expect(await screen.findByText('⌘⌫')).toHaveAttribute('data-slot', 'dropdown-menu-shortcut');
  });

  it('renders a checkbox item in the checked state', async () => {
    const user = userEvent.setup();
    render(<ComposedMenu />);

    await user.click(screen.getByText('Open menu'));

    expect(await screen.findByRole('menuitemcheckbox')).toHaveAttribute('aria-checked', 'true');
  });

  it('renders radio items within a radio group', async () => {
    const user = userEvent.setup();
    render(<ComposedMenu />);

    await user.click(screen.getByText('Open menu'));

    expect(await screen.findByRole('menuitemradio', { name: 'Light' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('renders separators between groups', async () => {
    const user = userEvent.setup();
    render(<ComposedMenu />);

    await user.click(screen.getByText('Open menu'));

    const menu = await screen.findByRole('menu');
    const separators = within(menu).getAllByRole('separator');
    expect(separators.length).toBeGreaterThan(0);
  });

  it('opens the submenu to render the sub content and its items', async () => {
    const user = userEvent.setup();
    render(<ComposedMenu />);

    await user.click(screen.getByText('Open menu'));

    const subTrigger = await screen.findByText('More');
    await user.click(subTrigger);

    expect(await screen.findByText('Nested item')).toBeInTheDocument();
  });

  it('renders portal-hosted content via DropdownMenuPortal', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Portal trigger</DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent>
            <DropdownMenuItem>Portaled item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
    );

    await user.click(screen.getByText('Portal trigger'));

    expect(await screen.findByText('Portaled item')).toBeInTheDocument();
  });
});
