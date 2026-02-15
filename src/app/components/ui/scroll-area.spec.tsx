/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { ScrollArea, ScrollBar } from './scroll-area';

describe('ScrollArea Components', () => {
  describe('ScrollArea', () => {
    it('renders children', () => {
      render(
        <ScrollArea>
          <div data-testid="content">Scrollable content</div>
        </ScrollArea>
      );

      expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    it('has data-slot attribute', () => {
      render(
        <ScrollArea data-testid="scroll-area">
          <div>Content</div>
        </ScrollArea>
      );

      expect(screen.getByTestId('scroll-area')).toHaveAttribute('data-slot', 'scroll-area');
    });

    it('applies custom className', () => {
      render(
        <ScrollArea data-testid="scroll-area" className="custom-scroll">
          <div>Content</div>
        </ScrollArea>
      );

      expect(screen.getByTestId('scroll-area')).toHaveClass('custom-scroll');
    });

    it('renders viewport with data-slot', () => {
      render(
        <ScrollArea>
          <div>Content</div>
        </ScrollArea>
      );

      expect(document.querySelector('[data-slot="scroll-area-viewport"]')).toBeInTheDocument();
    });

    it('passes additional props', () => {
      render(
        <ScrollArea data-testid="scroll-area" aria-label="Scrollable region">
          <div>Content</div>
        </ScrollArea>
      );

      expect(screen.getByTestId('scroll-area')).toHaveAttribute('aria-label', 'Scrollable region');
    });
  });

  describe('ScrollBar', () => {
    // Note: Radix ScrollAreaScrollbar only renders when there's actual overflow
    // which doesn't happen in JSDOM. Testing basic props instead.

    it('can be imported and has the correct export', () => {
      expect(ScrollBar).toBeDefined();
      expect(typeof ScrollBar).toBe('function');
    });
  });

  describe('integration', () => {
    it('renders scrollable content container', () => {
      render(
        <ScrollArea className="h-[200px] w-[350px]" data-testid="scroll-area">
          <div className="p-4">
            <h4>Scrollable Content</h4>
            <p>Lorem ipsum dolor sit amet...</p>
            <p>More content...</p>
            <p>Even more content...</p>
          </div>
        </ScrollArea>
      );

      expect(screen.getByTestId('scroll-area')).toBeInTheDocument();
      expect(screen.getByText('Scrollable Content')).toBeInTheDocument();
    });

    it('renders multiple children', () => {
      render(
        <ScrollArea>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
          <div data-testid="child-3">Child 3</div>
        </ScrollArea>
      );

      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
      expect(screen.getByTestId('child-3')).toBeInTheDocument();
    });
  });
});
