import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Slider } from './slider';

describe('Slider', () => {
  it('renders', () => {
    render(<Slider aria-label="Volume" />);

    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('has data-slot attribute', () => {
    render(<Slider aria-label="Volume" data-testid="slider" />);

    expect(screen.getByTestId('slider')).toHaveAttribute('data-slot', 'slider');
  });

  it('applies custom className', () => {
    render(<Slider aria-label="Volume" data-testid="slider" className="custom-slider" />);

    expect(screen.getByTestId('slider')).toHaveClass('custom-slider');
  });

  it('renders with default min and max', () => {
    render(<Slider aria-label="Volume" />);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '100');
  });

  it('supports custom min and max', () => {
    render(<Slider aria-label="Volume" min={10} max={50} />);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuemin', '10');
    expect(slider).toHaveAttribute('aria-valuemax', '50');
  });

  it('supports default value', () => {
    render(<Slider aria-label="Volume" defaultValue={[25]} />);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '25');
  });

  it('supports controlled value', () => {
    render(<Slider aria-label="Volume" value={[75]} />);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '75');
  });

  it('can be disabled', () => {
    render(<Slider aria-label="Volume" disabled data-testid="slider" />);

    expect(screen.getByTestId('slider')).toHaveAttribute('data-disabled');
  });

  it('renders track element', () => {
    render(<Slider aria-label="Volume" />);

    expect(document.querySelector('[data-slot="slider-track"]')).toBeInTheDocument();
  });

  it('renders range element', () => {
    render(<Slider aria-label="Volume" />);

    expect(document.querySelector('[data-slot="slider-range"]')).toBeInTheDocument();
  });

  it('renders thumb element', () => {
    render(<Slider aria-label="Volume" defaultValue={[50]} />);

    expect(document.querySelector('[data-slot="slider-thumb"]')).toBeInTheDocument();
  });

  it('renders multiple thumbs for range slider', () => {
    render(<Slider aria-label="Price range" defaultValue={[25, 75]} />);

    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(2);
  });

  it('calls onValueChange when value changes', async () => {
    const onValueChange = vi.fn();
    render(<Slider aria-label="Volume" defaultValue={[50]} onValueChange={onValueChange} />);

    const slider = screen.getByRole('slider');

    // Simulate keyboard interaction
    slider.focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(onValueChange).toHaveBeenCalled();
  });

  it('supports step prop', () => {
    render(<Slider aria-label="Volume" defaultValue={[50]} step={10} />);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuenow', '50');
  });

  it('supports orientation prop', () => {
    render(<Slider aria-label="Volume" orientation="vertical" data-testid="slider" />);

    expect(screen.getByTestId('slider')).toHaveAttribute('data-orientation', 'vertical');
  });

  describe('keyboard navigation', () => {
    it('increases value with ArrowRight', async () => {
      const user = userEvent.setup();
      render(<Slider aria-label="Volume" defaultValue={[50]} />);

      const slider = screen.getByRole('slider');
      slider.focus();

      await user.keyboard('{ArrowRight}');

      expect(slider).toHaveAttribute('aria-valuenow', '51');
    });

    it('decreases value with ArrowLeft', async () => {
      const user = userEvent.setup();
      render(<Slider aria-label="Volume" defaultValue={[50]} />);

      const slider = screen.getByRole('slider');
      slider.focus();

      await user.keyboard('{ArrowLeft}');

      expect(slider).toHaveAttribute('aria-valuenow', '49');
    });

    it('jumps to min with Home key', async () => {
      const user = userEvent.setup();
      render(<Slider aria-label="Volume" defaultValue={[50]} />);

      const slider = screen.getByRole('slider');
      slider.focus();

      await user.keyboard('{Home}');

      expect(slider).toHaveAttribute('aria-valuenow', '0');
    });

    it('jumps to max with End key', async () => {
      const user = userEvent.setup();
      render(<Slider aria-label="Volume" defaultValue={[50]} />);

      const slider = screen.getByRole('slider');
      slider.focus();

      await user.keyboard('{End}');

      expect(slider).toHaveAttribute('aria-valuenow', '100');
    });
  });

  describe('accessibility', () => {
    it('has proper slider role', () => {
      render(<Slider defaultValue={[50]} />);

      expect(screen.getByRole('slider')).toBeInTheDocument();
    });

    it('exposes aria-valuenow', () => {
      render(<Slider defaultValue={[50]} />);

      expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '50');
    });
  });
});
