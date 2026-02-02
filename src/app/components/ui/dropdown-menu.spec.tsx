import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from './dropdown-menu';

describe('DropdownMenu Components', () => {
  describe('DropdownMenu and basic components', () => {
    it('should render a dropdown menu with trigger', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open Menu</DropdownMenuTrigger>
          <DropdownMenuContent data-testid="content">
            <DropdownMenuItem>Item 1</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      expect(screen.getByTestId('trigger')).toBeInTheDocument();
      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('content')).toBeInTheDocument();
      });
    });

    it('should have data-slot attribute on trigger', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>Content</DropdownMenuContent>
        </DropdownMenu>
      );

      expect(screen.getByTestId('trigger')).toHaveAttribute('data-slot', 'dropdown-menu-trigger');
    });

    it('should have data-slot attribute on content', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent data-testid="content">Content</DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('content')).toHaveAttribute('data-slot', 'dropdown-menu-content');
      });
    });
  });

  describe('DropdownMenuItem', () => {
    it('should render menu items', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem data-testid="item1">Item 1</DropdownMenuItem>
            <DropdownMenuItem data-testid="item2">Item 2</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('item1')).toBeInTheDocument();
        expect(screen.getByTestId('item2')).toBeInTheDocument();
      });
    });

    it('should have data-slot attribute', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem data-testid="item">Item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('item')).toHaveAttribute('data-slot', 'dropdown-menu-item');
      });
    });

    it('should apply inset attribute', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem data-testid="item" inset>
              Inset Item
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('item')).toHaveAttribute('data-inset', 'true');
      });
    });

    it('should apply destructive variant', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem data-testid="item" variant="destructive">
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('item')).toHaveAttribute('data-variant', 'destructive');
      });
    });
  });

  describe('DropdownMenuGroup', () => {
    it('should render a group of items', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuGroup data-testid="group">
              <DropdownMenuItem>Item 1</DropdownMenuItem>
              <DropdownMenuItem>Item 2</DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('group')).toBeInTheDocument();
        expect(screen.getByTestId('group')).toHaveAttribute('data-slot', 'dropdown-menu-group');
      });
    });
  });

  describe('DropdownMenuLabel', () => {
    it('should render a label', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel data-testid="label">Menu Label</DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('label')).toBeInTheDocument();
        expect(screen.getByText('Menu Label')).toBeInTheDocument();
      });
    });

    it('should have data-slot attribute', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel data-testid="label">Label</DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('label')).toHaveAttribute('data-slot', 'dropdown-menu-label');
      });
    });

    it('should apply inset attribute', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel data-testid="label" inset>
              Inset Label
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('label')).toHaveAttribute('data-inset', 'true');
      });
    });
  });

  describe('DropdownMenuSeparator', () => {
    it('should render a separator', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Item 1</DropdownMenuItem>
            <DropdownMenuSeparator data-testid="separator" />
            <DropdownMenuItem>Item 2</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('separator')).toBeInTheDocument();
        expect(screen.getByTestId('separator')).toHaveAttribute(
          'data-slot',
          'dropdown-menu-separator'
        );
      });
    });
  });

  describe('DropdownMenuShortcut', () => {
    it('should render a shortcut', () => {
      render(<DropdownMenuShortcut data-testid="shortcut">⌘K</DropdownMenuShortcut>);

      expect(screen.getByTestId('shortcut')).toBeInTheDocument();
      expect(screen.getByText('⌘K')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      render(<DropdownMenuShortcut data-testid="shortcut">⌘K</DropdownMenuShortcut>);

      expect(screen.getByTestId('shortcut')).toHaveAttribute('data-slot', 'dropdown-menu-shortcut');
    });
  });

  describe('DropdownMenuCheckboxItem', () => {
    it('should render a checkbox item', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem data-testid="checkbox" checked>
              Checkbox Item
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('checkbox')).toBeInTheDocument();
        expect(screen.getByText('Checkbox Item')).toBeInTheDocument();
      });
    });

    it('should have data-slot attribute', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuCheckboxItem data-testid="checkbox">Item</DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('checkbox')).toHaveAttribute(
          'data-slot',
          'dropdown-menu-checkbox-item'
        );
      });
    });
  });

  describe('DropdownMenuRadioGroup and RadioItem', () => {
    it('should render radio items', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup data-testid="radio-group" value="option1">
              <DropdownMenuRadioItem data-testid="radio1" value="option1">
                Option 1
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem data-testid="radio2" value="option2">
                Option 2
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('radio-group')).toBeInTheDocument();
        expect(screen.getByTestId('radio1')).toBeInTheDocument();
        expect(screen.getByTestId('radio2')).toBeInTheDocument();
      });
    });

    it('should have data-slot attributes', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup data-testid="radio-group" value="opt1">
              <DropdownMenuRadioItem data-testid="radio1" value="opt1">
                Option
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('radio-group')).toHaveAttribute(
          'data-slot',
          'dropdown-menu-radio-group'
        );
        expect(screen.getByTestId('radio1')).toHaveAttribute(
          'data-slot',
          'dropdown-menu-radio-item'
        );
      });
    });
  });

  describe('DropdownMenuSub', () => {
    it('should render a submenu', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid="sub-trigger">More</DropdownMenuSubTrigger>
              <DropdownMenuSubContent data-testid="sub-content">
                <DropdownMenuItem>Sub Item</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('sub-trigger')).toBeInTheDocument();
      });
    });

    it('should have data-slot attribute on sub-trigger', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid="sub-trigger">More</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>Item</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('sub-trigger')).toHaveAttribute(
          'data-slot',
          'dropdown-menu-sub-trigger'
        );
      });
    });

    it('should apply inset to sub-trigger', async () => {
      const user = userEvent.setup();
      render(
        <DropdownMenu>
          <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger data-testid="sub-trigger" inset>
                More
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>Item</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('sub-trigger')).toHaveAttribute('data-inset', 'true');
      });
    });
  });
});
