/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from './command';

// Mock scrollIntoView for cmdk
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('Command', () => {
  describe('Command component', () => {
    it('renders with default props', () => {
      render(
        <Command data-testid="command">
          <CommandInput placeholder="Search..." />
        </Command>
      );

      expect(screen.getByTestId('command')).toBeInTheDocument();
      expect(screen.getByTestId('command')).toHaveAttribute('data-slot', 'command');
    });

    it('applies custom className', () => {
      render(
        <Command className="custom-class" data-testid="command">
          <CommandInput />
        </Command>
      );

      expect(screen.getByTestId('command')).toHaveClass('custom-class');
    });

    it('forwards additional props', () => {
      render(
        <Command data-testid="command" aria-label="Command menu">
          <CommandInput />
        </Command>
      );

      expect(screen.getByTestId('command')).toHaveAttribute('aria-label', 'Command menu');
    });
  });

  describe('CommandInput component', () => {
    it('renders input with search icon', () => {
      render(
        <Command>
          <CommandInput placeholder="Type a command..." />
        </Command>
      );

      expect(screen.getByPlaceholderText('Type a command...')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Command>
          <CommandInput className="custom-input" data-testid="input" />
        </Command>
      );

      expect(screen.getByRole('combobox')).toHaveClass('custom-input');
    });

    it('forwards ref correctly', () => {
      const TestComponent = () => {
        const ref = React.useRef<HTMLInputElement>(null);
        return (
          <Command>
            <CommandInput ref={ref} data-testid="command-input" />
          </Command>
        );
      };

      render(<TestComponent />);

      expect(screen.getByTestId('command-input')).toBeInstanceOf(HTMLInputElement);
    });

    it('handles disabled state', () => {
      render(
        <Command>
          <CommandInput disabled placeholder="Disabled" />
        </Command>
      );

      expect(screen.getByPlaceholderText('Disabled')).toBeDisabled();
    });

    it('has the command-input-wrapper data slot', () => {
      render(
        <Command>
          <CommandInput />
        </Command>
      );

      expect(screen.getByRole('combobox').parentElement).toHaveAttribute(
        'data-slot',
        'command-input-wrapper'
      );
    });
  });

  describe('CommandList component', () => {
    it('renders children', () => {
      render(
        <Command>
          <CommandList>
            <CommandEmpty>No results</CommandEmpty>
          </CommandList>
        </Command>
      );

      expect(screen.getByText('No results')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Command>
          <CommandList className="custom-list" data-testid="list">
            <CommandEmpty>No results</CommandEmpty>
          </CommandList>
        </Command>
      );

      expect(screen.getByTestId('list')).toHaveClass('custom-list');
    });

    it('has the command-list data slot', () => {
      render(
        <Command>
          <CommandList data-testid="list">
            <CommandEmpty>Empty</CommandEmpty>
          </CommandList>
        </Command>
      );

      expect(screen.getByTestId('list')).toHaveAttribute('data-slot', 'command-list');
    });
  });

  describe('CommandEmpty component', () => {
    it('renders empty message', () => {
      render(
        <Command>
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
          </CommandList>
        </Command>
      );

      expect(screen.getByText('No results found.')).toBeInTheDocument();
    });

    it('has the command-empty data slot', () => {
      render(
        <Command>
          <CommandList>
            <CommandEmpty data-testid="empty">Nothing here</CommandEmpty>
          </CommandList>
        </Command>
      );

      expect(screen.getByTestId('empty')).toHaveAttribute('data-slot', 'command-empty');
    });
  });

  describe('CommandGroup component', () => {
    it('renders group with heading', () => {
      render(
        <Command>
          <CommandList>
            <CommandGroup heading="Suggestions">
              <CommandItem>Item 1</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      );

      expect(screen.getByText('Suggestions')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Command>
          <CommandList>
            <CommandGroup className="custom-group" data-testid="group">
              <CommandItem>Item</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      );

      expect(screen.getByTestId('group')).toHaveClass('custom-group');
    });

    it('has the command-group data slot', () => {
      render(
        <Command>
          <CommandList>
            <CommandGroup data-testid="group">
              <CommandItem>Item</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      );

      expect(screen.getByTestId('group')).toHaveAttribute('data-slot', 'command-group');
    });
  });

  describe('CommandItem component', () => {
    it('renders item with content', () => {
      render(
        <Command>
          <CommandList>
            <CommandItem>Click me</CommandItem>
          </CommandList>
        </Command>
      );

      expect(screen.getByText('Click me')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Command>
          <CommandList>
            <CommandItem className="custom-item" data-testid="item">
              Item
            </CommandItem>
          </CommandList>
        </Command>
      );

      expect(screen.getByTestId('item')).toHaveClass('custom-item');
    });

    it('handles onSelect callback', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      render(
        <Command>
          <CommandList>
            <CommandItem onSelect={onSelect}>Select me</CommandItem>
          </CommandList>
        </Command>
      );

      await user.click(screen.getByText('Select me'));
      expect(onSelect).toHaveBeenCalled();
    });

    it('has the command-item data slot', () => {
      render(
        <Command>
          <CommandList>
            <CommandItem data-testid="item">Item</CommandItem>
          </CommandList>
        </Command>
      );

      expect(screen.getByTestId('item')).toHaveAttribute('data-slot', 'command-item');
    });

    it('handles disabled state', () => {
      render(
        <Command>
          <CommandList>
            <CommandItem disabled data-testid="disabled-item">
              Disabled
            </CommandItem>
          </CommandList>
        </Command>
      );

      expect(screen.getByTestId('disabled-item')).toHaveAttribute('data-disabled', 'true');
    });
  });

  describe('CommandSeparator component', () => {
    it('renders separator', () => {
      render(
        <Command>
          <CommandList>
            <CommandSeparator data-testid="separator" />
          </CommandList>
        </Command>
      );

      expect(screen.getByTestId('separator')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Command>
          <CommandList>
            <CommandSeparator className="custom-separator" data-testid="separator" />
          </CommandList>
        </Command>
      );

      expect(screen.getByTestId('separator')).toHaveClass('custom-separator');
    });

    it('has the command-separator data slot', () => {
      render(
        <Command>
          <CommandList>
            <CommandSeparator data-testid="separator" />
          </CommandList>
        </Command>
      );

      expect(screen.getByTestId('separator')).toHaveAttribute('data-slot', 'command-separator');
    });
  });

  describe('CommandShortcut component', () => {
    it('renders shortcut text', () => {
      render(
        <Command>
          <CommandList>
            <CommandItem>
              Open
              <CommandShortcut>⌘O</CommandShortcut>
            </CommandItem>
          </CommandList>
        </Command>
      );

      expect(screen.getByText('⌘O')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Command>
          <CommandList>
            <CommandItem>
              Save
              <CommandShortcut className="custom-shortcut" data-testid="shortcut">
                ⌘S
              </CommandShortcut>
            </CommandItem>
          </CommandList>
        </Command>
      );

      expect(screen.getByTestId('shortcut')).toHaveClass('custom-shortcut');
    });

    it('has the command-shortcut data slot', () => {
      render(
        <Command>
          <CommandList>
            <CommandItem>
              Cut
              <CommandShortcut data-testid="shortcut">⌘X</CommandShortcut>
            </CommandItem>
          </CommandList>
        </Command>
      );

      expect(screen.getByTestId('shortcut')).toHaveAttribute('data-slot', 'command-shortcut');
    });
  });

  describe('CommandDialog component', () => {
    it('renders dialog with default title and description', () => {
      render(
        <CommandDialog open>
          <CommandInput placeholder="Search commands..." />
        </CommandDialog>
      );

      expect(screen.getByText('Command Palette')).toBeInTheDocument();
      expect(screen.getByText('Search for a command to run...')).toBeInTheDocument();
    });

    it('renders dialog with custom title and description', () => {
      render(
        <CommandDialog open title="Custom Title" description="Custom description">
          <CommandInput />
        </CommandDialog>
      );

      expect(screen.getByText('Custom Title')).toBeInTheDocument();
      expect(screen.getByText('Custom description')).toBeInTheDocument();
    });

    it('applies custom className to dialog content', () => {
      render(
        <CommandDialog open className="custom-dialog">
          <CommandInput />
        </CommandDialog>
      );

      // The dialog content should have the custom class
      const dialogContent = document.querySelector('[data-slot="dialog-content"]');
      expect(dialogContent).toHaveClass('custom-dialog');
    });

    it('shows close button by default', () => {
      render(
        <CommandDialog open showCloseButton>
          <CommandInput />
        </CommandDialog>
      );

      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    it('hides close button when showCloseButton is false', () => {
      render(
        <CommandDialog open showCloseButton={false}>
          <CommandInput />
        </CommandDialog>
      );

      expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
    });

    it('renders children within command', () => {
      render(
        <CommandDialog open>
          <CommandInput placeholder="Type here..." />
          <CommandList>
            <CommandItem>Test Item</CommandItem>
          </CommandList>
        </CommandDialog>
      );

      expect(screen.getByPlaceholderText('Type here...')).toBeInTheDocument();
      expect(screen.getByText('Test Item')).toBeInTheDocument();
    });

    it('handles onOpenChange callback', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      render(
        <CommandDialog open onOpenChange={onOpenChange}>
          <CommandInput />
        </CommandDialog>
      );

      // Click close button
      await user.click(screen.getByRole('button', { name: /close/i }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('integration', () => {
    it('filters items based on input', async () => {
      const user = userEvent.setup();

      render(
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem>Create file</CommandItem>
              <CommandItem>Delete file</CommandItem>
              <CommandItem>Open settings</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      );

      const input = screen.getByPlaceholderText('Search...');

      // Type to filter
      await user.type(input, 'file');

      // cmdk should filter the items
      expect(screen.getByText('Create file')).toBeInTheDocument();
      expect(screen.getByText('Delete file')).toBeInTheDocument();
    });

    it('renders complete command structure', () => {
      render(
        <Command data-testid="command">
          <CommandInput placeholder="Search commands..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Suggestions">
              <CommandItem>
                New File
                <CommandShortcut>⌘N</CommandShortcut>
              </CommandItem>
              <CommandItem>Open File</CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Settings">
              <CommandItem>Preferences</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      );

      expect(screen.getByTestId('command')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search commands...')).toBeInTheDocument();
      expect(screen.getByText('Suggestions')).toBeInTheDocument();
      expect(screen.getByText('New File')).toBeInTheDocument();
      expect(screen.getByText('⌘N')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });
});
