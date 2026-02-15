/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './accordion';

describe('Accordion', () => {
  const renderAccordion = (props: { type: 'single' | 'multiple'; collapsible?: boolean }) => {
    return render(
      <Accordion {...props}>
        <AccordionItem value="item-1">
          <AccordionTrigger>Section 1</AccordionTrigger>
          <AccordionContent>Content 1</AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger>Section 2</AccordionTrigger>
          <AccordionContent>Content 2</AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  };

  describe('Accordion root', () => {
    it('renders', () => {
      renderAccordion({ type: 'single' });

      expect(screen.getByText('Section 1')).toBeInTheDocument();
      expect(screen.getByText('Section 2')).toBeInTheDocument();
    });

    it('has data-slot attribute', () => {
      render(
        <Accordion type="single" data-testid="accordion">
          <AccordionItem value="item-1">
            <AccordionTrigger>Section</AccordionTrigger>
            <AccordionContent>Content</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      expect(screen.getByTestId('accordion')).toHaveAttribute('data-slot', 'accordion');
    });

    it('supports single type - only one item open', async () => {
      const user = userEvent.setup();
      renderAccordion({ type: 'single' });

      const triggers = screen.getAllByRole('button');

      await user.click(triggers[0]);

      expect(triggers[0]).toHaveAttribute('data-state', 'open');
      expect(triggers[1]).toHaveAttribute('data-state', 'closed');

      await user.click(triggers[1]);

      expect(triggers[0]).toHaveAttribute('data-state', 'closed');
      expect(triggers[1]).toHaveAttribute('data-state', 'open');
    });

    it('supports multiple type - multiple items open', async () => {
      const user = userEvent.setup();
      renderAccordion({ type: 'multiple' });

      const triggers = screen.getAllByRole('button');

      await user.click(triggers[0]);
      await user.click(triggers[1]);

      expect(triggers[0]).toHaveAttribute('data-state', 'open');
      expect(triggers[1]).toHaveAttribute('data-state', 'open');
    });

    it('supports collapsible prop', async () => {
      const user = userEvent.setup();
      renderAccordion({ type: 'single', collapsible: true });

      const triggers = screen.getAllByRole('button');

      await user.click(triggers[0]);

      expect(triggers[0]).toHaveAttribute('data-state', 'open');

      await user.click(triggers[0]);

      expect(triggers[0]).toHaveAttribute('data-state', 'closed');
    });
  });

  describe('AccordionItem', () => {
    it('has data-slot attribute', () => {
      render(
        <Accordion type="single">
          <AccordionItem value="item-1" data-testid="item">
            <AccordionTrigger>Section</AccordionTrigger>
            <AccordionContent>Content</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      expect(screen.getByTestId('item')).toHaveAttribute('data-slot', 'accordion-item');
    });

    it('applies custom className', () => {
      render(
        <Accordion type="single">
          <AccordionItem value="item-1" data-testid="item" className="custom-item">
            <AccordionTrigger>Section</AccordionTrigger>
            <AccordionContent>Content</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      expect(screen.getByTestId('item')).toHaveClass('custom-item');
    });

    it('has border-b class', () => {
      render(
        <Accordion type="single">
          <AccordionItem value="item-1" data-testid="item">
            <AccordionTrigger>Section</AccordionTrigger>
            <AccordionContent>Content</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      expect(screen.getByTestId('item')).toHaveClass('border-b');
    });
  });

  describe('AccordionTrigger', () => {
    it('has data-slot attribute', () => {
      render(
        <Accordion type="single">
          <AccordionItem value="item-1">
            <AccordionTrigger>Section</AccordionTrigger>
            <AccordionContent>Content</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      expect(screen.getByRole('button')).toHaveAttribute('data-slot', 'accordion-trigger');
    });

    it('applies custom className', () => {
      render(
        <Accordion type="single">
          <AccordionItem value="item-1">
            <AccordionTrigger className="custom-trigger">Section</AccordionTrigger>
            <AccordionContent>Content</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      expect(screen.getByRole('button')).toHaveClass('custom-trigger');
    });

    it('renders children', () => {
      render(
        <Accordion type="single">
          <AccordionItem value="item-1">
            <AccordionTrigger>Custom Trigger Content</AccordionTrigger>
            <AccordionContent>Content</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      expect(screen.getByText('Custom Trigger Content')).toBeInTheDocument();
    });

    it('includes chevron icon', () => {
      render(
        <Accordion type="single">
          <AccordionItem value="item-1">
            <AccordionTrigger>Section</AccordionTrigger>
            <AccordionContent>Content</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      // Check for SVG icon (ChevronDownIcon)
      const button = screen.getByRole('button');
      expect(button.querySelector('svg')).toBeInTheDocument();
    });

    it('can be disabled', () => {
      render(
        <Accordion type="single">
          <AccordionItem value="item-1">
            <AccordionTrigger disabled>Section</AccordionTrigger>
            <AccordionContent>Content</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('AccordionContent', () => {
    it('has data-slot attribute', async () => {
      const user = userEvent.setup();
      render(
        <Accordion type="single">
          <AccordionItem value="item-1">
            <AccordionTrigger>Section</AccordionTrigger>
            <AccordionContent>Content</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        const content = document.querySelector('[data-slot="accordion-content"]');
        expect(content).toBeInTheDocument();
      });
    });

    it('applies custom className', async () => {
      const user = userEvent.setup();
      render(
        <Accordion type="single">
          <AccordionItem value="item-1">
            <AccordionTrigger>Section</AccordionTrigger>
            <AccordionContent className="custom-content">Content text</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByText('Content text')).toBeInTheDocument();
      });
    });

    it('shows content when expanded', async () => {
      const user = userEvent.setup();
      render(
        <Accordion type="single">
          <AccordionItem value="item-1">
            <AccordionTrigger>Section</AccordionTrigger>
            <AccordionContent>Content text here</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByText('Content text here')).toBeVisible();
      });
    });
  });

  describe('keyboard navigation', () => {
    it('toggles with Enter key', async () => {
      const user = userEvent.setup();
      renderAccordion({ type: 'single', collapsible: true });

      const trigger = screen.getAllByRole('button')[0];
      trigger.focus();

      await user.keyboard('{Enter}');

      expect(trigger).toHaveAttribute('data-state', 'open');

      await user.keyboard('{Enter}');

      expect(trigger).toHaveAttribute('data-state', 'closed');
    });

    it('toggles with Space key', async () => {
      const user = userEvent.setup();
      renderAccordion({ type: 'single', collapsible: true });

      const trigger = screen.getAllByRole('button')[0];
      trigger.focus();

      await user.keyboard(' ');

      expect(trigger).toHaveAttribute('data-state', 'open');
    });
  });

  describe('controlled state', () => {
    it('supports controlled value in single mode', async () => {
      const onValueChange = vi.fn();
      render(
        <Accordion type="single" value="" onValueChange={onValueChange}>
          <AccordionItem value="item-1">
            <AccordionTrigger>Section 1</AccordionTrigger>
            <AccordionContent>Content 1</AccordionContent>
          </AccordionItem>
        </Accordion>
      );

      await userEvent.click(screen.getByRole('button'));

      expect(onValueChange).toHaveBeenCalledWith('item-1');
    });
  });
});
