/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from './popover';

describe('Popover Components', () => {
  describe('Popover', () => {
    it('should render a popover with trigger and content', async () => {
      const user = userEvent.setup();
      render(
        <Popover>
          <PopoverTrigger data-testid="trigger">Open</PopoverTrigger>
          <PopoverContent data-testid="content">Content</PopoverContent>
        </Popover>
      );

      const trigger = screen.getByTestId('trigger');
      expect(trigger).toBeInTheDocument();

      await user.click(trigger);

      await waitFor(() => {
        expect(screen.getByTestId('content')).toBeInTheDocument();
      });
    });
  });

  describe('PopoverTrigger', () => {
    it('should render the trigger button', () => {
      render(
        <Popover>
          <PopoverTrigger data-testid="trigger">Click me</PopoverTrigger>
          <PopoverContent>Content</PopoverContent>
        </Popover>
      );

      expect(screen.getByTestId('trigger')).toBeInTheDocument();
      expect(screen.getByText('Click me')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      render(
        <Popover>
          <PopoverTrigger data-testid="trigger">Trigger</PopoverTrigger>
          <PopoverContent>Content</PopoverContent>
        </Popover>
      );

      expect(screen.getByTestId('trigger')).toHaveAttribute('data-slot', 'popover-trigger');
    });
  });

  describe('PopoverContent', () => {
    it('should render content when popover is open', async () => {
      const user = userEvent.setup();
      render(
        <Popover>
          <PopoverTrigger data-testid="trigger">Open</PopoverTrigger>
          <PopoverContent data-testid="content">Popover Content</PopoverContent>
        </Popover>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('content')).toBeInTheDocument();
        expect(screen.getByText('Popover Content')).toBeInTheDocument();
      });
    });

    it('should have data-slot attribute on content', async () => {
      const user = userEvent.setup();
      render(
        <Popover>
          <PopoverTrigger data-testid="trigger">Open</PopoverTrigger>
          <PopoverContent data-testid="content">Content</PopoverContent>
        </Popover>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('content')).toHaveAttribute('data-slot', 'popover-content');
      });
    });

    it('should apply custom className', async () => {
      const user = userEvent.setup();
      render(
        <Popover>
          <PopoverTrigger data-testid="trigger">Open</PopoverTrigger>
          <PopoverContent data-testid="content" className="custom-class">
            Content
          </PopoverContent>
        </Popover>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('content')).toHaveClass('custom-class');
      });
    });

    it('should merge custom className with default classes', async () => {
      const user = userEvent.setup();
      render(
        <Popover>
          <PopoverTrigger data-testid="trigger">Open</PopoverTrigger>
          <PopoverContent data-testid="content" className="custom-class">
            Content
          </PopoverContent>
        </Popover>
      );

      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        const content = screen.getByTestId('content');
        expect(content).toHaveClass('rounded-md');
        expect(content).toHaveClass('custom-class');
      });
    });
  });

  describe('PopoverAnchor', () => {
    it('should render the anchor element', () => {
      render(
        <Popover>
          <PopoverAnchor data-testid="anchor">Anchor Element</PopoverAnchor>
          <PopoverTrigger>Open</PopoverTrigger>
          <PopoverContent>Content</PopoverContent>
        </Popover>
      );

      expect(screen.getByTestId('anchor')).toBeInTheDocument();
    });

    it('should have data-slot attribute', () => {
      render(
        <Popover>
          <PopoverAnchor data-testid="anchor">Anchor</PopoverAnchor>
          <PopoverTrigger>Open</PopoverTrigger>
          <PopoverContent>Content</PopoverContent>
        </Popover>
      );

      expect(screen.getByTestId('anchor')).toHaveAttribute('data-slot', 'popover-anchor');
    });
  });

  describe('Popover open/close behavior', () => {
    it('should close when clicking outside', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <div data-testid="outside">Outside</div>
          <Popover>
            <PopoverTrigger data-testid="trigger">Open</PopoverTrigger>
            <PopoverContent data-testid="content">Content</PopoverContent>
          </Popover>
        </div>
      );

      // Open popover
      await user.click(screen.getByTestId('trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('content')).toBeInTheDocument();
      });

      // Click outside
      await user.click(screen.getByTestId('outside'));

      await waitFor(() => {
        expect(screen.queryByTestId('content')).not.toBeInTheDocument();
      });
    });

    it('should close when trigger is clicked again', async () => {
      const user = userEvent.setup();
      render(
        <Popover>
          <PopoverTrigger data-testid="trigger">Open</PopoverTrigger>
          <PopoverContent data-testid="content">Content</PopoverContent>
        </Popover>
      );

      const trigger = screen.getByTestId('trigger');

      // Open popover
      await user.click(trigger);

      await waitFor(() => {
        expect(screen.getByTestId('content')).toBeInTheDocument();
      });

      // Close by clicking trigger again
      await user.click(trigger);

      await waitFor(() => {
        expect(screen.queryByTestId('content')).not.toBeInTheDocument();
      });
    });
  });
});
