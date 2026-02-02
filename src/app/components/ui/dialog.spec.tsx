import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from './dialog';

describe('Dialog Components', () => {
  describe('Dialog', () => {
    it('renders children', () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Test Dialog</DialogTitle>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByText('Test Dialog')).toBeInTheDocument();
    });
  });

  describe('DialogTrigger', () => {
    it('renders with data-slot attribute', async () => {
      const user = userEvent.setup();

      render(
        <Dialog>
          <DialogTrigger data-testid="trigger">Open Dialog</DialogTrigger>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      const trigger = screen.getByTestId('trigger');
      expect(trigger).toHaveAttribute('data-slot', 'dialog-trigger');

      // Click trigger to open dialog
      await user.click(trigger);

      // Dialog should be open
      expect(screen.getByText('Title')).toBeInTheDocument();
    });

    it('renders children', () => {
      render(
        <Dialog>
          <DialogTrigger>Click me</DialogTrigger>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByText('Click me')).toBeInTheDocument();
    });
  });

  describe('DialogPortal', () => {
    it('renders children in portal', () => {
      render(
        <Dialog open>
          <DialogPortal data-testid="portal">
            <div data-testid="portal-content">Portal Content</div>
          </DialogPortal>
        </Dialog>
      );

      expect(screen.getByTestId('portal-content')).toBeInTheDocument();
    });
  });

  describe('DialogClose', () => {
    it('renders with data-slot attribute', () => {
      render(
        <Dialog open>
          <DialogContent showCloseButton={false}>
            <DialogTitle>Title</DialogTitle>
            <DialogClose data-testid="close">Close</DialogClose>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByTestId('close')).toHaveAttribute('data-slot', 'dialog-close');
    });

    it('closes dialog when clicked', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      render(
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent showCloseButton={false}>
            <DialogTitle>Title</DialogTitle>
            <DialogClose data-testid="close">Close</DialogClose>
          </DialogContent>
        </Dialog>
      );

      await user.click(screen.getByTestId('close'));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('DialogOverlay', () => {
    it('renders with data-slot attribute', () => {
      render(
        <Dialog open>
          <DialogOverlay data-testid="overlay" />
        </Dialog>
      );

      expect(screen.getByTestId('overlay')).toHaveAttribute('data-slot', 'dialog-overlay');
    });

    it('applies custom className', () => {
      render(
        <Dialog open>
          <DialogOverlay data-testid="overlay" className="custom-overlay" />
        </Dialog>
      );

      expect(screen.getByTestId('overlay')).toHaveClass('custom-overlay');
    });
  });

  describe('DialogContent', () => {
    it('renders with data-slot attribute', () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      const content = document.querySelector('[data-slot="dialog-content"]');
      expect(content).toBeInTheDocument();
    });

    it('shows close button by default', () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });

    it('hides close button when showCloseButton is false', () => {
      render(
        <Dialog open>
          <DialogContent showCloseButton={false}>
            <DialogTitle>Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Dialog open>
          <DialogContent className="custom-content">
            <DialogTitle>Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      const content = document.querySelector('[data-slot="dialog-content"]');
      expect(content).toHaveClass('custom-content');
    });

    it('close button closes dialog', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();

      render(
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      await user.click(screen.getByRole('button', { name: /close/i }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('DialogHeader', () => {
    it('renders with data-slot attribute', () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogHeader data-testid="header">
              <DialogTitle>Title</DialogTitle>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByTestId('header')).toHaveAttribute('data-slot', 'dialog-header');
    });

    it('applies custom className', () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogHeader data-testid="header" className="custom-header">
              <DialogTitle>Title</DialogTitle>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByTestId('header')).toHaveClass('custom-header');
    });
  });

  describe('DialogFooter', () => {
    it('renders with data-slot attribute', () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogFooter data-testid="footer">
              <button>Action</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByTestId('footer')).toHaveAttribute('data-slot', 'dialog-footer');
    });

    it('applies custom className', () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogFooter data-testid="footer" className="custom-footer">
              <button>Action</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByTestId('footer')).toHaveClass('custom-footer');
    });
  });

  describe('DialogTitle', () => {
    it('renders with data-slot attribute', () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogTitle data-testid="title">My Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByTestId('title')).toHaveAttribute('data-slot', 'dialog-title');
    });

    it('renders children', () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogTitle>My Title</DialogTitle>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByText('My Title')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogTitle data-testid="title" className="custom-title">
              Title
            </DialogTitle>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByTestId('title')).toHaveClass('custom-title');
    });
  });

  describe('DialogDescription', () => {
    it('renders with data-slot attribute', () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription data-testid="description">Description text</DialogDescription>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByTestId('description')).toHaveAttribute('data-slot', 'dialog-description');
    });

    it('renders children', () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>This is a description</DialogDescription>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByText('This is a description')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <Dialog open>
          <DialogContent>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription data-testid="description" className="custom-description">
              Description
            </DialogDescription>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByTestId('description')).toHaveClass('custom-description');
    });
  });

  describe('integration', () => {
    it('renders a complete dialog structure', async () => {
      const user = userEvent.setup();

      render(
        <Dialog>
          <DialogTrigger>Open</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dialog Title</DialogTitle>
              <DialogDescription>Dialog description text</DialogDescription>
            </DialogHeader>
            <div>Dialog body content</div>
            <DialogFooter>
              <DialogClose>Cancel</DialogClose>
              <button>Confirm</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );

      // Dialog should not be visible initially
      expect(screen.queryByText('Dialog Title')).not.toBeInTheDocument();

      // Open dialog
      await user.click(screen.getByText('Open'));

      // Dialog should now be visible
      expect(screen.getByText('Dialog Title')).toBeInTheDocument();
      expect(screen.getByText('Dialog description text')).toBeInTheDocument();
      expect(screen.getByText('Dialog body content')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Confirm')).toBeInTheDocument();
    });
  });
});
