/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet';

describe('Sheet Components', () => {
  describe('Sheet', () => {
    it('renders children', () => {
      render(
        <Sheet>
          <SheetTrigger data-testid="trigger">Open</SheetTrigger>
        </Sheet>
      );

      expect(screen.getByTestId('trigger')).toBeInTheDocument();
    });
  });

  describe('SheetTrigger', () => {
    it('renders with data-slot attribute', () => {
      render(
        <Sheet>
          <SheetTrigger data-testid="trigger">Trigger</SheetTrigger>
        </Sheet>
      );

      expect(screen.getByTestId('trigger')).toHaveAttribute('data-slot', 'sheet-trigger');
    });

    it('renders children', () => {
      render(
        <Sheet>
          <SheetTrigger>Open Sheet</SheetTrigger>
        </Sheet>
      );

      expect(screen.getByText('Open Sheet')).toBeInTheDocument();
    });
  });

  describe('SheetClose', () => {
    it('renders with data-slot attribute', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open</SheetTrigger>
          <SheetContent>
            <SheetClose data-testid="close">Close</SheetClose>
          </SheetContent>
        </Sheet>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('close')).toHaveAttribute('data-slot', 'sheet-close');
      });
    });

    it('closes sheet when clicked', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open</SheetTrigger>
          <SheetContent>
            <SheetTitle>Title</SheetTitle>
            <SheetClose>Close</SheetClose>
          </SheetContent>
        </Sheet>
      );

      await user.click(screen.getByText('Open'));
      await waitFor(() => {
        expect(screen.getByText('Close')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Close'));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('SheetContent', () => {
    it('renders with data-slot attribute', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open</SheetTrigger>
          <SheetContent data-testid="content">
            <SheetTitle>Title</SheetTitle>
          </SheetContent>
        </Sheet>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('content')).toHaveAttribute('data-slot', 'sheet-content');
      });
    });

    it('applies custom className', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open</SheetTrigger>
          <SheetContent data-testid="content" className="custom-sheet">
            <SheetTitle>Title</SheetTitle>
          </SheetContent>
        </Sheet>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('content')).toHaveClass('custom-sheet');
      });
    });

    it('defaults to right side', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open</SheetTrigger>
          <SheetContent data-testid="content">
            <SheetTitle>Title</SheetTitle>
          </SheetContent>
        </Sheet>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('content')).toHaveClass('right-0');
      });
    });

    it('renders on left side', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open</SheetTrigger>
          <SheetContent data-testid="content" side="left">
            <SheetTitle>Title</SheetTitle>
          </SheetContent>
        </Sheet>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('content')).toHaveClass('left-0');
      });
    });

    it('renders on top', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open</SheetTrigger>
          <SheetContent data-testid="content" side="top">
            <SheetTitle>Title</SheetTitle>
          </SheetContent>
        </Sheet>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('content')).toHaveClass('top-0');
      });
    });

    it('renders on bottom', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open</SheetTrigger>
          <SheetContent data-testid="content" side="bottom">
            <SheetTitle>Title</SheetTitle>
          </SheetContent>
        </Sheet>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('content')).toHaveClass('bottom-0');
      });
    });
  });

  describe('SheetHeader', () => {
    it('renders with data-slot attribute', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open</SheetTrigger>
          <SheetContent>
            <SheetHeader data-testid="header">Header Content</SheetHeader>
          </SheetContent>
        </Sheet>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('header')).toHaveAttribute('data-slot', 'sheet-header');
      });
    });

    it('applies custom className', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open</SheetTrigger>
          <SheetContent>
            <SheetHeader data-testid="header" className="custom-header">
              Header
            </SheetHeader>
          </SheetContent>
        </Sheet>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('header')).toHaveClass('custom-header');
      });
    });
  });

  describe('SheetFooter', () => {
    it('renders with data-slot attribute', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open</SheetTrigger>
          <SheetContent>
            <SheetFooter data-testid="footer">Footer Content</SheetFooter>
          </SheetContent>
        </Sheet>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('footer')).toHaveAttribute('data-slot', 'sheet-footer');
      });
    });

    it('applies custom className', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open</SheetTrigger>
          <SheetContent>
            <SheetFooter data-testid="footer" className="custom-footer">
              Footer
            </SheetFooter>
          </SheetContent>
        </Sheet>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('footer')).toHaveClass('custom-footer');
      });
    });
  });

  describe('SheetTitle', () => {
    it('renders with data-slot attribute', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open</SheetTrigger>
          <SheetContent>
            <SheetTitle data-testid="title">Sheet Title</SheetTitle>
          </SheetContent>
        </Sheet>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('title')).toHaveAttribute('data-slot', 'sheet-title');
      });
    });

    it('applies custom className', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open</SheetTrigger>
          <SheetContent>
            <SheetTitle data-testid="title" className="custom-title">
              Title
            </SheetTitle>
          </SheetContent>
        </Sheet>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('title')).toHaveClass('custom-title');
      });
    });
  });

  describe('SheetDescription', () => {
    it('renders with data-slot attribute', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open</SheetTrigger>
          <SheetContent>
            <SheetTitle>Title</SheetTitle>
            <SheetDescription data-testid="description">Sheet Description</SheetDescription>
          </SheetContent>
        </Sheet>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('description')).toHaveAttribute('data-slot', 'sheet-description');
      });
    });

    it('applies custom className', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open</SheetTrigger>
          <SheetContent>
            <SheetTitle>Title</SheetTitle>
            <SheetDescription data-testid="description" className="custom-desc">
              Description
            </SheetDescription>
          </SheetContent>
        </Sheet>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('description')).toHaveClass('custom-desc');
      });
    });
  });

  describe('integration', () => {
    it('renders a complete sheet', async () => {
      const user = userEvent.setup();

      render(
        <Sheet>
          <SheetTrigger>Open Menu</SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
              <SheetDescription>Navigation menu</SheetDescription>
            </SheetHeader>
            <div>Menu content here</div>
            <SheetFooter>
              <SheetClose>Close Menu</SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      );

      // Initially sheet is closed
      expect(screen.queryByText('Menu')).not.toBeInTheDocument();

      // Open sheet
      await user.click(screen.getByText('Open Menu'));

      await waitFor(() => {
        expect(screen.getByText('Menu')).toBeInTheDocument();
        expect(screen.getByText('Navigation menu')).toBeInTheDocument();
        expect(screen.getByText('Menu content here')).toBeInTheDocument();
      });
    });
  });
});
