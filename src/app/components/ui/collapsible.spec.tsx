/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible';

describe('Collapsible Components', () => {
  describe('Collapsible', () => {
    it('renders children', () => {
      render(
        <Collapsible>
          <CollapsibleTrigger data-testid="trigger">Toggle</CollapsibleTrigger>
        </Collapsible>
      );

      expect(screen.getByTestId('trigger')).toBeInTheDocument();
    });
  });

  describe('CollapsibleTrigger', () => {
    it('renders with data-slot attribute', () => {
      render(
        <Collapsible>
          <CollapsibleTrigger data-testid="trigger">Toggle</CollapsibleTrigger>
        </Collapsible>
      );

      expect(screen.getByTestId('trigger')).toHaveAttribute('data-slot', 'collapsible-trigger');
    });

    it('renders children', () => {
      render(
        <Collapsible>
          <CollapsibleTrigger>Click to expand</CollapsibleTrigger>
        </Collapsible>
      );

      expect(screen.getByText('Click to expand')).toBeInTheDocument();
    });

    it('toggles content on click', async () => {
      const user = userEvent.setup();

      render(
        <Collapsible>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Hidden content</CollapsibleContent>
        </Collapsible>
      );

      // Initially content is hidden
      expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();

      // Click to open
      await user.click(screen.getByText('Toggle'));

      await waitFor(() => {
        expect(screen.getByText('Hidden content')).toBeInTheDocument();
      });
    });

    it('passes through props', () => {
      render(
        <Collapsible>
          <CollapsibleTrigger data-testid="trigger" aria-label="Toggle section">
            Toggle
          </CollapsibleTrigger>
        </Collapsible>
      );

      expect(screen.getByTestId('trigger')).toHaveAttribute('aria-label', 'Toggle section');
    });
  });

  describe('CollapsibleContent', () => {
    it('renders with data-slot attribute when open', () => {
      render(
        <Collapsible defaultOpen>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent data-testid="content">Content</CollapsibleContent>
        </Collapsible>
      );

      expect(screen.getByTestId('content')).toHaveAttribute('data-slot', 'collapsible-content');
    });

    it('renders children when open', () => {
      render(
        <Collapsible defaultOpen>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Expanded content</CollapsibleContent>
        </Collapsible>
      );

      expect(screen.getByText('Expanded content')).toBeInTheDocument();
    });

    it('hides content when closed', () => {
      render(
        <Collapsible>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Hidden content</CollapsibleContent>
        </Collapsible>
      );

      expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
    });
  });

  describe('integration', () => {
    it('expands and collapses content', async () => {
      const user = userEvent.setup();

      render(
        <Collapsible>
          <CollapsibleTrigger>Show details</CollapsibleTrigger>
          <CollapsibleContent>
            <p>These are the details</p>
          </CollapsibleContent>
        </Collapsible>
      );

      // Initially collapsed
      expect(screen.queryByText('These are the details')).not.toBeInTheDocument();

      // Expand
      await user.click(screen.getByText('Show details'));
      await waitFor(() => {
        expect(screen.getByText('These are the details')).toBeInTheDocument();
      });

      // Collapse
      await user.click(screen.getByText('Show details'));
      await waitFor(() => {
        expect(screen.queryByText('These are the details')).not.toBeInTheDocument();
      });
    });

    it('renders controlled collapsible', async () => {
      const onOpenChange = vi.fn();

      render(
        <Collapsible open={false} onOpenChange={onOpenChange}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );

      await userEvent.click(screen.getByText('Toggle'));

      expect(onOpenChange).toHaveBeenCalledWith(true);
    });

    it('renders with defaultOpen', () => {
      render(
        <Collapsible defaultOpen>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Initially visible</CollapsibleContent>
        </Collapsible>
      );

      expect(screen.getByText('Initially visible')).toBeInTheDocument();
    });
  });
});
