import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToggleGroup, ToggleGroupItem } from './toggle-group';

describe('ToggleGroup', () => {
  describe('ToggleGroup root', () => {
    it('renders', () => {
      render(
        <ToggleGroup type="single">
          <ToggleGroupItem value="a">A</ToggleGroupItem>
        </ToggleGroup>
      );

      expect(screen.getByRole('group')).toBeInTheDocument();
    });

    it('has data-slot attribute', () => {
      render(
        <ToggleGroup type="single" data-testid="toggle-group">
          <ToggleGroupItem value="a">A</ToggleGroupItem>
        </ToggleGroup>
      );

      expect(screen.getByTestId('toggle-group')).toHaveAttribute('data-slot', 'toggle-group');
    });

    it('applies custom className', () => {
      render(
        <ToggleGroup type="single" data-testid="toggle-group" className="custom-class">
          <ToggleGroupItem value="a">A</ToggleGroupItem>
        </ToggleGroup>
      );

      expect(screen.getByTestId('toggle-group')).toHaveClass('custom-class');
    });

    it('supports single selection', async () => {
      const user = userEvent.setup();
      render(
        <ToggleGroup type="single">
          <ToggleGroupItem value="a">A</ToggleGroupItem>
          <ToggleGroupItem value="b">B</ToggleGroupItem>
        </ToggleGroup>
      );

      const buttons = screen.getAllByRole('radio');

      expect(buttons[0]).toHaveAttribute('data-state', 'off');
      expect(buttons[1]).toHaveAttribute('data-state', 'off');

      await user.click(buttons[0]);

      expect(buttons[0]).toHaveAttribute('data-state', 'on');
      expect(buttons[1]).toHaveAttribute('data-state', 'off');

      await user.click(buttons[1]);

      expect(buttons[0]).toHaveAttribute('data-state', 'off');
      expect(buttons[1]).toHaveAttribute('data-state', 'on');
    });

    it('supports multiple selection', async () => {
      const user = userEvent.setup();
      render(
        <ToggleGroup type="multiple">
          <ToggleGroupItem value="a">A</ToggleGroupItem>
          <ToggleGroupItem value="b">B</ToggleGroupItem>
        </ToggleGroup>
      );

      const buttons = screen.getAllByRole('button');

      await user.click(buttons[0]);
      await user.click(buttons[1]);

      expect(buttons[0]).toHaveAttribute('data-state', 'on');
      expect(buttons[1]).toHaveAttribute('data-state', 'on');
    });

    it('passes variant to context', () => {
      render(
        <ToggleGroup type="single" variant="outline" data-testid="toggle-group">
          <ToggleGroupItem value="a" data-testid="item">
            A
          </ToggleGroupItem>
        </ToggleGroup>
      );

      expect(screen.getByTestId('toggle-group')).toHaveAttribute('data-variant', 'outline');
      expect(screen.getByTestId('item')).toHaveAttribute('data-variant', 'outline');
    });

    it('passes size to context', () => {
      render(
        <ToggleGroup type="single" size="sm" data-testid="toggle-group">
          <ToggleGroupItem value="a" data-testid="item">
            A
          </ToggleGroupItem>
        </ToggleGroup>
      );

      expect(screen.getByTestId('toggle-group')).toHaveAttribute('data-size', 'sm');
      expect(screen.getByTestId('item')).toHaveAttribute('data-size', 'sm');
    });
  });

  describe('ToggleGroupItem', () => {
    it('has data-slot attribute', () => {
      render(
        <ToggleGroup type="single">
          <ToggleGroupItem value="a" data-testid="item">
            A
          </ToggleGroupItem>
        </ToggleGroup>
      );

      expect(screen.getByTestId('item')).toHaveAttribute('data-slot', 'toggle-group-item');
    });

    it('applies custom className', () => {
      render(
        <ToggleGroup type="single">
          <ToggleGroupItem value="a" data-testid="item" className="custom-item">
            A
          </ToggleGroupItem>
        </ToggleGroup>
      );

      expect(screen.getByTestId('item')).toHaveClass('custom-item');
    });

    it('can be disabled', () => {
      render(
        <ToggleGroup type="single">
          <ToggleGroupItem value="a" disabled>
            A
          </ToggleGroupItem>
        </ToggleGroup>
      );

      expect(screen.getByRole('radio')).toBeDisabled();
    });

    it('renders children', () => {
      render(
        <ToggleGroup type="single">
          <ToggleGroupItem value="a">Item Content</ToggleGroupItem>
        </ToggleGroup>
      );

      expect(screen.getByText('Item Content')).toBeInTheDocument();
    });

    it('can override variant from context', () => {
      render(
        <ToggleGroup type="single" variant="default">
          <ToggleGroupItem value="a" variant="outline" data-testid="item">
            A
          </ToggleGroupItem>
        </ToggleGroup>
      );

      // Item should use its own variant, not context
      expect(screen.getByTestId('item')).toHaveAttribute('data-variant', 'default');
    });
  });

  describe('keyboard navigation', () => {
    it('navigates with arrow keys in single mode', async () => {
      const user = userEvent.setup();
      render(
        <ToggleGroup type="single">
          <ToggleGroupItem value="a">A</ToggleGroupItem>
          <ToggleGroupItem value="b">B</ToggleGroupItem>
          <ToggleGroupItem value="c">C</ToggleGroupItem>
        </ToggleGroup>
      );

      const buttons = screen.getAllByRole('radio');
      buttons[0].focus();

      await user.keyboard('{ArrowRight}');

      expect(buttons[1]).toHaveFocus();
    });
  });

  describe('controlled state', () => {
    it('supports controlled single value', async () => {
      const onValueChange = vi.fn();
      render(
        <ToggleGroup type="single" value="" onValueChange={onValueChange}>
          <ToggleGroupItem value="a">A</ToggleGroupItem>
          <ToggleGroupItem value="b">B</ToggleGroupItem>
        </ToggleGroup>
      );

      await userEvent.click(screen.getAllByRole('radio')[0]);

      expect(onValueChange).toHaveBeenCalledWith('a');
    });

    it('supports controlled multiple values', async () => {
      const onValueChange = vi.fn();
      render(
        <ToggleGroup type="multiple" value={['a']} onValueChange={onValueChange}>
          <ToggleGroupItem value="a">A</ToggleGroupItem>
          <ToggleGroupItem value="b">B</ToggleGroupItem>
        </ToggleGroup>
      );

      await userEvent.click(screen.getAllByRole('button')[1]);

      expect(onValueChange).toHaveBeenCalledWith(['a', 'b']);
    });
  });
});
