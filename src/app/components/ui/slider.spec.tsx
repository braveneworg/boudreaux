import React from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Slider } from './slider';

// Mock @radix-ui/react-slider to avoid React 19 + Radix + jsdom compatibility issues.
// Radix primitives use internal React dispatcher patterns that break in jsdom with React 19.
vi.mock('@radix-ui/react-slider', () => {
  interface SliderContextValue {
    values: number[];
    setValues: (values: number[]) => void;
    min: number;
    max: number;
    step: number;
    onValueChange?: (values: number[]) => void;
    thumbIndexRef: { current: number };
  }

  const SliderContext = React.createContext<SliderContextValue>({
    values: [0, 100],
    setValues: () => {},
    min: 0,
    max: 100,
    step: 1,
    thumbIndexRef: { current: 0 },
  });

  interface MockRootProps {
    children?: React.ReactNode;
    className?: string;
    defaultValue?: number[];
    value?: number[];
    min?: number;
    max?: number;
    step?: number;
    orientation?: string;
    disabled?: boolean;
    onValueChange?: (values: number[]) => void;
    [key: string]: unknown;
  }

  function MockRoot({
    children,
    className,
    defaultValue,
    value,
    min = 0,
    max = 100,
    step = 1,
    orientation = 'horizontal',
    disabled,
    onValueChange,
    ...props
  }: MockRootProps) {
    const initial = value ?? defaultValue ?? [min, max];
    const [values, setValues] = React.useState<number[]>(initial);
    const thumbIndexRef = React.useRef(0);
    thumbIndexRef.current = 0;

    return (
      <span
        className={className}
        data-orientation={orientation}
        {...(disabled ? { 'data-disabled': '' } : {})}
        {...props}
      >
        <SliderContext.Provider
          value={{ values, setValues, min, max, step, onValueChange, thumbIndexRef }}
        >
          {children}
        </SliderContext.Provider>
      </span>
    );
  }

  function MockTrack({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) {
    return <span {...props}>{children}</span>;
  }

  function MockRange(props: Record<string, unknown>) {
    return <span {...props} />;
  }

  function MockThumb(props: Record<string, unknown>) {
    const ctx = React.useContext(SliderContext);
    const [myIndex] = React.useState(() => ctx.thumbIndexRef.current++);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      const currentVal = ctx.values[myIndex] ?? 0;
      let newVal = currentVal;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          newVal = Math.min(ctx.max, currentVal + ctx.step);
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          newVal = Math.max(ctx.min, currentVal - ctx.step);
          break;
        case 'Home':
          newVal = ctx.min;
          break;
        case 'End':
          newVal = ctx.max;
          break;
      }

      if (newVal !== currentVal) {
        const newValues = [...ctx.values];
        newValues[myIndex] = newVal;
        ctx.setValues(newValues);
        ctx.onValueChange?.(newValues);
      }
    };

    return (
      <span
        role="slider"
        tabIndex={0}
        aria-valuemin={ctx.min}
        aria-valuemax={ctx.max}
        aria-valuenow={ctx.values[myIndex]}
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  }

  return { Root: MockRoot, Track: MockTrack, Range: MockRange, Thumb: MockThumb };
});

describe('Slider', () => {
  it('renders', () => {
    render(<Slider aria-label="Volume" defaultValue={[50]} />);

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
    render(<Slider aria-label="Volume" defaultValue={[50]} />);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '100');
  });

  it('supports custom min and max', () => {
    render(<Slider aria-label="Volume" min={10} max={50} defaultValue={[30]} />);

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
    render(<Slider aria-label="Volume" defaultValue={[50]} />);

    expect(document.querySelector('[data-slot="slider-track"]')).toBeInTheDocument();
  });

  it('renders range element', () => {
    render(<Slider aria-label="Volume" defaultValue={[50]} />);

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
