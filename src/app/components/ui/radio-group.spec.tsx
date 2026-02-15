/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RadioGroup, RadioGroupItem } from './radio-group';

describe('RadioGroup', () => {
  describe('RadioGroup root', () => {
    it('renders', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="a" />
        </RadioGroup>
      );

      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    });

    it('has data-slot attribute', () => {
      render(
        <RadioGroup data-testid="radio-group">
          <RadioGroupItem value="a" />
        </RadioGroup>
      );

      expect(screen.getByTestId('radio-group')).toHaveAttribute('data-slot', 'radio-group');
    });

    it('applies custom className', () => {
      render(
        <RadioGroup data-testid="radio-group" className="custom-class">
          <RadioGroupItem value="a" />
        </RadioGroup>
      );

      expect(screen.getByTestId('radio-group')).toHaveClass('custom-class');
    });

    it('allows selecting a radio item', async () => {
      const user = userEvent.setup();
      render(
        <RadioGroup>
          <RadioGroupItem value="a" id="option-a" />
          <RadioGroupItem value="b" id="option-b" />
        </RadioGroup>
      );

      const radios = screen.getAllByRole('radio');

      expect(radios[0]).not.toBeChecked();
      expect(radios[1]).not.toBeChecked();

      await user.click(radios[0]);

      expect(radios[0]).toBeChecked();
      expect(radios[1]).not.toBeChecked();
    });

    it('only allows one selection', async () => {
      const user = userEvent.setup();
      render(
        <RadioGroup>
          <RadioGroupItem value="a" />
          <RadioGroupItem value="b" />
        </RadioGroup>
      );

      const radios = screen.getAllByRole('radio');

      await user.click(radios[0]);
      expect(radios[0]).toBeChecked();

      await user.click(radios[1]);
      expect(radios[0]).not.toBeChecked();
      expect(radios[1]).toBeChecked();
    });

    it('supports controlled value', async () => {
      const onValueChange = vi.fn();
      render(
        <RadioGroup value="" onValueChange={onValueChange}>
          <RadioGroupItem value="a" />
          <RadioGroupItem value="b" />
        </RadioGroup>
      );

      await userEvent.click(screen.getAllByRole('radio')[0]);

      expect(onValueChange).toHaveBeenCalledWith('a');
    });

    it('supports default value', () => {
      render(
        <RadioGroup defaultValue="b">
          <RadioGroupItem value="a" />
          <RadioGroupItem value="b" />
        </RadioGroup>
      );

      const radios = screen.getAllByRole('radio');
      expect(radios[0]).not.toBeChecked();
      expect(radios[1]).toBeChecked();
    });
  });

  describe('RadioGroupItem', () => {
    it('has data-slot attribute', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="a" data-testid="radio-item" />
        </RadioGroup>
      );

      expect(screen.getByTestId('radio-item')).toHaveAttribute('data-slot', 'radio-group-item');
    });

    it('applies custom className', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="a" data-testid="radio-item" className="custom-item" />
        </RadioGroup>
      );

      expect(screen.getByTestId('radio-item')).toHaveClass('custom-item');
    });

    it('can be disabled', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="a" disabled />
        </RadioGroup>
      );

      expect(screen.getByRole('radio')).toBeDisabled();
    });

    it('passes additional props', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="a" id="my-radio" aria-label="Option A" />
        </RadioGroup>
      );

      const radio = screen.getByRole('radio');
      expect(radio).toHaveAttribute('id', 'my-radio');
      expect(radio).toHaveAttribute('aria-label', 'Option A');
    });

    it('shows indicator when checked', async () => {
      const user = userEvent.setup();
      render(
        <RadioGroup>
          <RadioGroupItem value="a" data-testid="radio-item" />
        </RadioGroup>
      );

      await user.click(screen.getByTestId('radio-item'));

      expect(document.querySelector('[data-slot="radio-group-indicator"]')).toBeInTheDocument();
    });
  });

  describe('keyboard navigation', () => {
    it('navigates with arrow keys', async () => {
      const user = userEvent.setup();
      render(
        <RadioGroup>
          <RadioGroupItem value="a" />
          <RadioGroupItem value="b" />
          <RadioGroupItem value="c" />
        </RadioGroup>
      );

      const radios = screen.getAllByRole('radio');
      radios[0].focus();

      await user.keyboard('{ArrowDown}');

      expect(radios[1]).toHaveFocus();
    });

    it('selects with Space key', async () => {
      const user = userEvent.setup();
      render(
        <RadioGroup>
          <RadioGroupItem value="a" />
        </RadioGroup>
      );

      const radio = screen.getByRole('radio');
      radio.focus();

      await user.keyboard(' ');

      expect(radio).toBeChecked();
    });
  });

  describe('accessibility', () => {
    it('has correct role', () => {
      render(
        <RadioGroup>
          <RadioGroupItem value="a" />
        </RadioGroup>
      );

      expect(screen.getByRole('radiogroup')).toBeInTheDocument();
      expect(screen.getByRole('radio')).toBeInTheDocument();
    });

    it('supports aria-label on group', () => {
      render(
        <RadioGroup aria-label="Select an option">
          <RadioGroupItem value="a" />
        </RadioGroup>
      );

      expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-label', 'Select an option');
    });
  });
});
