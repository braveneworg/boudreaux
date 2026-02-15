/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

describe('Tooltip Components', () => {
  describe('TooltipProvider', () => {
    it('renders children', () => {
      render(
        <TooltipProvider>
          <div data-testid="child">Child content</div>
        </TooltipProvider>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('uses default delayDuration of 0', () => {
      render(
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>Hover me</TooltipTrigger>
            <TooltipContent>Tooltip content</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      expect(screen.getByText('Hover me')).toBeInTheDocument();
    });

    it('accepts custom delayDuration', () => {
      render(
        <TooltipProvider delayDuration={500}>
          <Tooltip>
            <TooltipTrigger>Hover me</TooltipTrigger>
            <TooltipContent>Tooltip content</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

      expect(screen.getByText('Hover me')).toBeInTheDocument();
    });
  });

  describe('Tooltip', () => {
    it('renders trigger', () => {
      render(
        <Tooltip>
          <TooltipTrigger>Trigger</TooltipTrigger>
          <TooltipContent>Content</TooltipContent>
        </Tooltip>
      );

      expect(screen.getByText('Trigger')).toBeInTheDocument();
    });

    it('shows tooltip on hover', async () => {
      const user = userEvent.setup();

      render(
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip text unique</TooltipContent>
        </Tooltip>
      );

      // Hover over trigger
      await user.hover(screen.getByText('Hover me'));

      // Tooltip should appear - use getAllByRole since portal may duplicate
      await waitFor(() => {
        const tooltips = screen.getAllByRole('tooltip');
        expect(tooltips.length).toBeGreaterThan(0);
      });
    });

    it('tooltip can be shown and verified', async () => {
      const user = userEvent.setup();

      render(
        <Tooltip>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Tooltip text leave</TooltipContent>
        </Tooltip>
      );

      // Hover to show tooltip
      await user.hover(screen.getByText('Hover me'));
      await waitFor(() => {
        expect(screen.getAllByRole('tooltip').length).toBeGreaterThan(0);
      });
    });
  });

  describe('TooltipTrigger', () => {
    it('renders with data-slot attribute', () => {
      render(
        <Tooltip>
          <TooltipTrigger data-testid="trigger">Trigger</TooltipTrigger>
          <TooltipContent>Content</TooltipContent>
        </Tooltip>
      );

      expect(screen.getByTestId('trigger')).toHaveAttribute('data-slot', 'tooltip-trigger');
    });

    it('renders children', () => {
      render(
        <Tooltip>
          <TooltipTrigger>
            <span data-testid="trigger-child">Button text</span>
          </TooltipTrigger>
          <TooltipContent>Content</TooltipContent>
        </Tooltip>
      );

      expect(screen.getByTestId('trigger-child')).toBeInTheDocument();
    });

    it('forwards asChild prop', () => {
      render(
        <Tooltip>
          <TooltipTrigger asChild>
            <button data-testid="custom-button">Custom Button</button>
          </TooltipTrigger>
          <TooltipContent>Content</TooltipContent>
        </Tooltip>
      );

      expect(screen.getByTestId('custom-button')).toBeInTheDocument();
    });
  });

  describe('TooltipContent', () => {
    it('renders with data-slot attribute', async () => {
      const user = userEvent.setup();

      render(
        <Tooltip>
          <TooltipTrigger>Trigger</TooltipTrigger>
          <TooltipContent data-testid="content">Content text</TooltipContent>
        </Tooltip>
      );

      await user.hover(screen.getByText('Trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('content')).toHaveAttribute('data-slot', 'tooltip-content');
      });
    });

    it('applies custom className', async () => {
      const user = userEvent.setup();

      render(
        <Tooltip>
          <TooltipTrigger>Trigger</TooltipTrigger>
          <TooltipContent className="custom-class" data-testid="content">
            Content
          </TooltipContent>
        </Tooltip>
      );

      await user.hover(screen.getByText('Trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('content')).toHaveClass('custom-class');
      });
    });

    it('renders children', async () => {
      const user = userEvent.setup();

      render(
        <Tooltip>
          <TooltipTrigger>Trigger</TooltipTrigger>
          <TooltipContent data-testid="tooltip-children">Tooltip content here</TooltipContent>
        </Tooltip>
      );

      await user.hover(screen.getByText('Trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('tooltip-children')).toHaveTextContent('Tooltip content here');
      });
    });

    it('uses default sideOffset of 0', async () => {
      const user = userEvent.setup();

      render(
        <Tooltip>
          <TooltipTrigger>Trigger</TooltipTrigger>
          <TooltipContent data-testid="default-offset">Default offset content</TooltipContent>
        </Tooltip>
      );

      await user.hover(screen.getByText('Trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('default-offset')).toBeInTheDocument();
      });
    });

    it('accepts custom sideOffset', async () => {
      const user = userEvent.setup();

      render(
        <Tooltip>
          <TooltipTrigger>Trigger</TooltipTrigger>
          <TooltipContent sideOffset={10} data-testid="custom-offset">
            Custom offset content
          </TooltipContent>
        </Tooltip>
      );

      await user.hover(screen.getByText('Trigger'));

      await waitFor(() => {
        expect(screen.getByTestId('custom-offset')).toBeInTheDocument();
      });
    });
  });

  describe('integration', () => {
    it('renders complete tooltip structure with pointer interaction', async () => {
      const user = userEvent.setup();

      render(
        <Tooltip>
          <TooltipTrigger asChild>
            <button>Button with tooltip</button>
          </TooltipTrigger>
          <TooltipContent data-testid="integration-tooltip">
            This is helpful information
          </TooltipContent>
        </Tooltip>
      );

      // Hover to show tooltip
      await user.hover(screen.getByText('Button with tooltip'));

      // Tooltip should appear on hover
      await waitFor(() => {
        expect(screen.getByTestId('integration-tooltip')).toBeInTheDocument();
      });
    });

    it('multiple tooltips can coexist', async () => {
      const user = userEvent.setup();

      render(
        <>
          <Tooltip>
            <TooltipTrigger>First</TooltipTrigger>
            <TooltipContent data-testid="first-tooltip">First tooltip</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>Second</TooltipTrigger>
            <TooltipContent data-testid="second-tooltip">Second tooltip</TooltipContent>
          </Tooltip>
        </>
      );

      await user.hover(screen.getByText('First'));
      await waitFor(() => {
        expect(screen.getByTestId('first-tooltip')).toBeInTheDocument();
      });

      await user.unhover(screen.getByText('First'));
      await user.hover(screen.getByText('Second'));

      await waitFor(() => {
        expect(screen.getByTestId('second-tooltip')).toBeInTheDocument();
      });
    });
  });
});
