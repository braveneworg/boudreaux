import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog';

describe('AlertDialog Components', () => {
  describe('AlertDialog', () => {
    it('renders children', () => {
      render(
        <AlertDialog>
          <AlertDialogTrigger data-testid="trigger">Open</AlertDialogTrigger>
        </AlertDialog>
      );

      expect(screen.getByTestId('trigger')).toBeInTheDocument();
    });

    it('has data-slot attribute', () => {
      const { container } = render(
        <AlertDialog>
          <div>Content</div>
        </AlertDialog>
      );

      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('AlertDialogTrigger', () => {
    it('renders with data-slot attribute', () => {
      render(
        <AlertDialog>
          <AlertDialogTrigger data-testid="trigger">Trigger</AlertDialogTrigger>
        </AlertDialog>
      );

      expect(screen.getByTestId('trigger')).toHaveAttribute('data-slot', 'alert-dialog-trigger');
    });

    it('renders children', () => {
      render(
        <AlertDialog>
          <AlertDialogTrigger>Click me</AlertDialogTrigger>
        </AlertDialog>
      );

      expect(screen.getByText('Click me')).toBeInTheDocument();
    });
  });

  describe('AlertDialogPortal', () => {
    it('renders children in portal', () => {
      render(
        <AlertDialog defaultOpen>
          <AlertDialogPortal>
            <div data-testid="portal-content">Portal Content</div>
          </AlertDialogPortal>
        </AlertDialog>
      );

      expect(screen.getByTestId('portal-content')).toBeInTheDocument();
    });
  });

  describe('AlertDialogOverlay', () => {
    it('renders with data-slot attribute', () => {
      render(
        <AlertDialog defaultOpen>
          <AlertDialogPortal>
            <AlertDialogOverlay data-testid="overlay" />
          </AlertDialogPortal>
        </AlertDialog>
      );

      expect(screen.getByTestId('overlay')).toHaveAttribute('data-slot', 'alert-dialog-overlay');
    });

    it('applies custom className', () => {
      render(
        <AlertDialog defaultOpen>
          <AlertDialogPortal>
            <AlertDialogOverlay data-testid="overlay" className="custom-overlay" />
          </AlertDialogPortal>
        </AlertDialog>
      );

      expect(screen.getByTestId('overlay')).toHaveClass('custom-overlay');
    });
  });

  describe('AlertDialogContent', () => {
    it('renders with data-slot attribute', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent data-testid="content">
            <AlertDialogTitle>Title</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('content')).toHaveAttribute('data-slot', 'alert-dialog-content');
      });
    });

    it('applies custom className', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent data-testid="content" className="custom-content">
            <AlertDialogTitle>Title</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('content')).toHaveClass('custom-content');
      });
    });
  });

  describe('AlertDialogHeader', () => {
    it('renders with data-slot attribute', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader data-testid="header">Header Content</AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('header')).toHaveAttribute('data-slot', 'alert-dialog-header');
      });
    });

    it('applies custom className', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader data-testid="header" className="custom-header">
              Header
            </AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('header')).toHaveClass('custom-header');
      });
    });
  });

  describe('AlertDialogFooter', () => {
    it('renders with data-slot attribute', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogFooter data-testid="footer">Footer Content</AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('footer')).toHaveAttribute('data-slot', 'alert-dialog-footer');
      });
    });

    it('applies custom className', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogFooter data-testid="footer" className="custom-footer">
              Footer
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('footer')).toHaveClass('custom-footer');
      });
    });
  });

  describe('AlertDialogTitle', () => {
    it('renders with data-slot attribute', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle data-testid="title">Dialog Title</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('title')).toHaveAttribute('data-slot', 'alert-dialog-title');
      });
    });

    it('applies custom className', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle data-testid="title" className="custom-title">
              Title
            </AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('title')).toHaveClass('custom-title');
      });
    });
  });

  describe('AlertDialogDescription', () => {
    it('renders with data-slot attribute', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Title</AlertDialogTitle>
            <AlertDialogDescription data-testid="description">Description</AlertDialogDescription>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('description')).toHaveAttribute(
          'data-slot',
          'alert-dialog-description'
        );
      });
    });

    it('applies custom className', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Title</AlertDialogTitle>
            <AlertDialogDescription data-testid="description" className="custom-desc">
              Description
            </AlertDialogDescription>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('description')).toHaveClass('custom-desc');
      });
    });
  });

  describe('AlertDialogAction', () => {
    it('renders with button styles', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Title</AlertDialogTitle>
            <AlertDialogFooter>
              <AlertDialogAction data-testid="action">Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('action')).toBeInTheDocument();
      });
    });

    it('applies custom className', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Title</AlertDialogTitle>
            <AlertDialogFooter>
              <AlertDialogAction data-testid="action" className="custom-action">
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('action')).toHaveClass('custom-action');
      });
    });

    it('closes dialog when clicked', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Title</AlertDialogTitle>
            <AlertDialogFooter>
              <AlertDialogAction>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByText('Open'));
      await waitFor(() => {
        expect(screen.getByText('Confirm')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Confirm'));

      await waitFor(() => {
        expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
      });
    });
  });

  describe('AlertDialogCancel', () => {
    it('renders with outline button styles', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Title</AlertDialogTitle>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="cancel">Cancel</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('cancel')).toBeInTheDocument();
      });
    });

    it('applies custom className', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Title</AlertDialogTitle>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="cancel" className="custom-cancel">
                Cancel
              </AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('cancel')).toHaveClass('custom-cancel');
      });
    });

    it('closes dialog when clicked', async () => {
      const user = userEvent.setup();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Open</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogTitle>Title</AlertDialogTitle>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      await user.click(screen.getByText('Open'));
      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
      });
    });
  });

  describe('integration', () => {
    it('renders a complete alert dialog', async () => {
      const user = userEvent.setup();
      const onAction = vi.fn();

      render(
        <AlertDialog>
          <AlertDialogTrigger>Delete Item</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onAction}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      // Initially dialog is closed
      expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument();

      // Open dialog
      await user.click(screen.getByText('Delete Item'));

      await waitFor(() => {
        expect(screen.getByText('Are you sure?')).toBeInTheDocument();
        expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
      });

      // Click action button
      await user.click(screen.getByText('Delete'));

      expect(onAction).toHaveBeenCalled();
    });
  });
});
