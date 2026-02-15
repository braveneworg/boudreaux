/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Toggle, toggleVariants } from './toggle';

describe('Toggle', () => {
  it('renders', () => {
    render(<Toggle aria-label="Toggle">Toggle</Toggle>);

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('has data-slot attribute', () => {
    render(
      <Toggle aria-label="Toggle" data-testid="toggle">
        Toggle
      </Toggle>
    );

    expect(screen.getByTestId('toggle')).toHaveAttribute('data-slot', 'toggle');
  });

  it('applies custom className', () => {
    render(
      <Toggle aria-label="Toggle" data-testid="toggle" className="custom-class">
        Toggle
      </Toggle>
    );

    expect(screen.getByTestId('toggle')).toHaveClass('custom-class');
  });

  it('can be pressed', async () => {
    const user = userEvent.setup();
    render(<Toggle aria-label="Toggle">Toggle</Toggle>);

    const toggle = screen.getByRole('button');

    expect(toggle).toHaveAttribute('data-state', 'off');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('data-state', 'on');
  });

  it('can be unpressed', async () => {
    const user = userEvent.setup();
    render(
      <Toggle aria-label="Toggle" defaultPressed>
        Toggle
      </Toggle>
    );

    const toggle = screen.getByRole('button');

    expect(toggle).toHaveAttribute('data-state', 'on');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('data-state', 'off');
  });

  it('supports controlled state', async () => {
    const onPressedChange = vi.fn();
    render(
      <Toggle aria-label="Toggle" pressed={false} onPressedChange={onPressedChange}>
        Toggle
      </Toggle>
    );

    await userEvent.click(screen.getByRole('button'));

    expect(onPressedChange).toHaveBeenCalledWith(true);
  });

  it('can be disabled', () => {
    render(
      <Toggle aria-label="Toggle" disabled>
        Toggle
      </Toggle>
    );

    expect(screen.getByRole('button')).toBeDisabled();
  });

  describe('variants', () => {
    it('renders default variant', () => {
      render(
        <Toggle aria-label="Toggle" data-testid="toggle">
          Toggle
        </Toggle>
      );

      expect(screen.getByTestId('toggle')).toHaveClass('bg-transparent');
    });

    it('renders outline variant', () => {
      render(
        <Toggle aria-label="Toggle" variant="outline" data-testid="toggle">
          Toggle
        </Toggle>
      );

      expect(screen.getByTestId('toggle')).toHaveClass('border', 'border-input');
    });
  });

  describe('sizes', () => {
    it('renders default size', () => {
      render(
        <Toggle aria-label="Toggle" data-testid="toggle">
          Toggle
        </Toggle>
      );

      expect(screen.getByTestId('toggle')).toHaveClass('h-9');
    });

    it('renders small size', () => {
      render(
        <Toggle aria-label="Toggle" size="sm" data-testid="toggle">
          Toggle
        </Toggle>
      );

      expect(screen.getByTestId('toggle')).toHaveClass('h-8');
    });

    it('renders large size', () => {
      render(
        <Toggle aria-label="Toggle" size="lg" data-testid="toggle">
          Toggle
        </Toggle>
      );

      expect(screen.getByTestId('toggle')).toHaveClass('h-10');
    });
  });

  it('toggles via keyboard', async () => {
    const user = userEvent.setup();
    render(<Toggle aria-label="Toggle">Toggle</Toggle>);

    const toggle = screen.getByRole('button');
    toggle.focus();

    expect(toggle).toHaveAttribute('data-state', 'off');

    await user.keyboard('{Enter}');

    expect(toggle).toHaveAttribute('data-state', 'on');
  });

  describe('toggleVariants', () => {
    it('returns default variant classes', () => {
      const classes = toggleVariants();
      expect(classes).toContain('bg-transparent');
    });

    it('returns outline variant classes', () => {
      const classes = toggleVariants({ variant: 'outline' });
      expect(classes).toContain('border');
    });

    it('returns size classes', () => {
      const classes = toggleVariants({ size: 'sm' });
      expect(classes).toContain('h-8');
    });
  });
});
