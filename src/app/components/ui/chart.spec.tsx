import { render, screen } from '@testing-library/react';

import {
  ChartContainer,
  ChartStyle,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from './chart';

import type { ChartConfig } from './chart';

// Mock recharts ResponsiveContainer as it doesn't work well in JSDOM
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="responsive-container">{children}</div>
    ),
  };
});

describe('ChartContainer', () => {
  const mockConfig: ChartConfig = {
    revenue: {
      label: 'Revenue',
      color: '#2563eb',
    },
    profit: {
      label: 'Profit',
      theme: {
        light: '#10b981',
        dark: '#22c55e',
      },
    },
  };

  it('renders with data-slot attribute', () => {
    render(
      <ChartContainer config={mockConfig}>
        <div>Chart content</div>
      </ChartContainer>
    );

    expect(document.querySelector('[data-slot="chart"]')).toBeInTheDocument();
  });

  it('renders with data-chart attribute containing unique id', () => {
    render(
      <ChartContainer config={mockConfig}>
        <div>Chart content</div>
      </ChartContainer>
    );

    const chart = document.querySelector('[data-chart]');
    expect(chart).toBeInTheDocument();
    expect(chart?.getAttribute('data-chart')).toMatch(/^chart-/);
  });

  it('applies custom className', () => {
    render(
      <ChartContainer config={mockConfig} className="custom-chart">
        <div>Chart content</div>
      </ChartContainer>
    );

    expect(document.querySelector('[data-slot="chart"]')).toHaveClass('custom-chart');
  });

  it('uses custom id when provided', () => {
    render(
      <ChartContainer config={mockConfig} id="my-chart">
        <div>Chart content</div>
      </ChartContainer>
    );

    expect(document.querySelector('[data-chart="chart-my-chart"]')).toBeInTheDocument();
  });

  it('renders children inside ResponsiveContainer', () => {
    render(
      <ChartContainer config={mockConfig}>
        <div data-testid="chart-child">Chart content</div>
      </ChartContainer>
    );

    expect(screen.getByTestId('chart-child')).toBeInTheDocument();
  });
});

describe('ChartStyle', () => {
  const configWithColor: ChartConfig = {
    revenue: {
      label: 'Revenue',
      color: '#2563eb',
    },
  };

  const configWithTheme: ChartConfig = {
    profit: {
      label: 'Profit',
      theme: {
        light: '#10b981',
        dark: '#22c55e',
      },
    },
  };

  const emptyConfig: ChartConfig = {
    empty: {
      label: 'Empty',
    },
  };

  it('renders style element with color config', () => {
    const { container } = render(<ChartStyle id="test-chart" config={configWithColor} />);

    const style = container.querySelector('style');
    expect(style).toBeInTheDocument();
    expect(style?.innerHTML).toContain('--color-revenue');
    expect(style?.innerHTML).toContain('#2563eb');
  });

  it('renders style element with theme config', () => {
    const { container } = render(<ChartStyle id="test-chart" config={configWithTheme} />);

    const style = container.querySelector('style');
    expect(style).toBeInTheDocument();
    expect(style?.innerHTML).toContain('.dark');
    expect(style?.innerHTML).toContain('#22c55e');
  });

  it('returns null for empty color config', () => {
    const { container } = render(<ChartStyle id="test-chart" config={emptyConfig} />);

    const style = container.querySelector('style');
    expect(style).toBeNull();
  });
});

describe('ChartTooltip', () => {
  it('exports ChartTooltip component', () => {
    expect(ChartTooltip).toBeDefined();
  });
});

describe('ChartTooltipContent', () => {
  const testConfig: ChartConfig = {
    revenue: { label: 'Revenue', color: '#2563eb' },
    profit: { label: 'Profit', color: '#10b981' },
  };

  it('returns null when not active', () => {
    render(
      <ChartContainer config={testConfig}>
        <ChartTooltipContent active={false} payload={[]} />
      </ChartContainer>
    );

    // Should not render any content when not active
    expect(screen.queryByText('Revenue')).toBeNull();
  });

  it('returns null when payload is empty', () => {
    render(
      <ChartContainer config={testConfig}>
        <ChartTooltipContent active payload={[]} />
      </ChartContainer>
    );

    // Should not render when payload is empty
    expect(screen.queryByText('Revenue')).toBeNull();
  });

  it('renders tooltip content when active with payload', () => {
    const mockPayload = [
      {
        value: 1000,
        name: 'revenue',
        dataKey: 'revenue',
        color: '#2563eb',
        payload: { revenue: 1000 },
      },
    ];

    render(
      <ChartContainer config={testConfig}>
        <ChartTooltipContent active payload={mockPayload} />
      </ChartContainer>
    );

    // Should render the label and value - there may be multiple
    const revenueElements = screen.getAllByText('Revenue');
    expect(revenueElements.length).toBeGreaterThan(0);
    expect(screen.getByText('1,000')).toBeInTheDocument();
  });

  it('renders with dot indicator by default', () => {
    const mockPayload = [
      {
        value: 500,
        name: 'revenue',
        dataKey: 'revenue',
        color: '#2563eb',
        payload: { revenue: 500 },
      },
    ];

    const { container } = render(
      <ChartContainer config={testConfig}>
        <ChartTooltipContent active payload={mockPayload} indicator="dot" />
      </ChartContainer>
    );

    // Check for dot indicator styling (h-2.5 w-2.5)
    const indicator = container.querySelector('.h-2\\.5.w-2\\.5');
    expect(indicator).toBeInTheDocument();
  });

  it('renders with line indicator', () => {
    const mockPayload = [
      {
        value: 500,
        name: 'revenue',
        dataKey: 'revenue',
        color: '#2563eb',
        payload: { revenue: 500 },
      },
    ];

    const { container } = render(
      <ChartContainer config={testConfig}>
        <ChartTooltipContent active payload={mockPayload} indicator="line" />
      </ChartContainer>
    );

    // Check for line indicator styling (w-1)
    const indicator = container.querySelector('.w-1');
    expect(indicator).toBeInTheDocument();
  });

  it('renders with dashed indicator', () => {
    const mockPayload = [
      {
        value: 500,
        name: 'revenue',
        dataKey: 'revenue',
        color: '#2563eb',
        payload: { revenue: 500 },
      },
    ];

    const { container } = render(
      <ChartContainer config={testConfig}>
        <ChartTooltipContent active payload={mockPayload} indicator="dashed" />
      </ChartContainer>
    );

    // Check for dashed indicator styling (border-dashed)
    const indicator = container.querySelector('.border-dashed');
    expect(indicator).toBeInTheDocument();
  });

  it('hides label when hideLabel is true', () => {
    const mockPayload = [
      {
        value: 1000,
        name: 'revenue',
        dataKey: 'revenue',
        color: '#2563eb',
        payload: { revenue: 1000 },
      },
    ];

    render(
      <ChartContainer config={testConfig}>
        <ChartTooltipContent active payload={mockPayload} hideLabel label="Test" />
      </ChartContainer>
    );

    // The label should not appear when hideLabel is true
    expect(screen.queryByText('Test')).toBeNull();
  });

  it('hides indicator when hideIndicator is true', () => {
    const mockPayload = [
      {
        value: 500,
        name: 'revenue',
        dataKey: 'revenue',
        color: '#2563eb',
        payload: { revenue: 500 },
      },
    ];

    const { container } = render(
      <ChartContainer config={testConfig}>
        <ChartTooltipContent active payload={mockPayload} hideIndicator />
      </ChartContainer>
    );

    // No indicator should be present
    const indicator = container.querySelector('.h-2\\.5.w-2\\.5');
    expect(indicator).toBeNull();
  });

  it('uses custom formatter when provided', () => {
    const mockPayload = [
      {
        value: 1000,
        name: 'revenue',
        dataKey: 'revenue',
        color: '#2563eb',
        payload: { revenue: 1000 },
      },
    ];

    const customFormatter = vi.fn(() => <span data-testid="custom-format">Custom: $1,000</span>);

    render(
      <ChartContainer config={testConfig}>
        <ChartTooltipContent active payload={mockPayload} formatter={customFormatter} />
      </ChartContainer>
    );

    expect(screen.getByTestId('custom-format')).toBeInTheDocument();
    expect(customFormatter).toHaveBeenCalled();
  });

  it('uses custom labelFormatter when provided', () => {
    const mockPayload = [
      {
        value: 1000,
        name: 'revenue',
        dataKey: 'revenue',
        color: '#2563eb',
        payload: { revenue: 1000 },
      },
    ];

    const labelFormatter = vi.fn((value) => `Formatted: ${value}`);

    render(
      <ChartContainer config={testConfig}>
        <ChartTooltipContent
          active
          payload={mockPayload}
          label="Jan"
          labelFormatter={labelFormatter}
        />
      </ChartContainer>
    );

    expect(screen.getByText('Formatted: Jan')).toBeInTheDocument();
  });

  it('filters out items with type "none"', () => {
    const mockPayload = [
      {
        value: 1000,
        name: 'revenue',
        dataKey: 'revenue',
        color: '#2563eb',
        payload: { revenue: 1000 },
        type: 'none' as const,
      },
    ];

    render(
      <ChartContainer config={testConfig}>
        <ChartTooltipContent active payload={mockPayload} />
      </ChartContainer>
    );

    // Revenue should not appear because type is 'none'
    expect(screen.queryByText('1,000')).toBeNull();
  });
});

describe('ChartLegend', () => {
  it('exports ChartLegend component', () => {
    expect(ChartLegend).toBeDefined();
  });
});

describe('ChartLegendContent', () => {
  const testConfig: ChartConfig = {
    revenue: { label: 'Revenue', color: '#2563eb' },
    profit: { label: 'Profit', color: '#10b981' },
  };

  it('returns null when payload is empty', () => {
    render(
      <ChartContainer config={testConfig}>
        <ChartLegendContent payload={[]} />
      </ChartContainer>
    );

    // Should not render when payload is empty
    expect(screen.queryByText('Revenue')).toBeNull();
  });

  it('returns null when payload is undefined', () => {
    render(
      <ChartContainer config={testConfig}>
        <ChartLegendContent payload={undefined} />
      </ChartContainer>
    );

    expect(screen.queryByText('Revenue')).toBeNull();
  });

  it('renders legend items with payload', () => {
    const mockPayload = [
      { value: 'revenue', dataKey: 'revenue', color: '#2563eb' },
      { value: 'profit', dataKey: 'profit', color: '#10b981' },
    ];

    render(
      <ChartContainer config={testConfig}>
        <ChartLegendContent payload={mockPayload} />
      </ChartContainer>
    );

    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Profit')).toBeInTheDocument();
  });

  it('hides icon when hideIcon is true', () => {
    const mockPayload = [{ value: 'revenue', dataKey: 'revenue', color: '#2563eb' }];

    const configWithIcon: ChartConfig = {
      revenue: {
        label: 'Revenue',
        color: '#2563eb',
        icon: () => <span data-testid="custom-icon">Icon</span>,
      },
    };

    render(
      <ChartContainer config={configWithIcon}>
        <ChartLegendContent payload={mockPayload} hideIcon />
      </ChartContainer>
    );

    // Custom icon should not be rendered
    expect(screen.queryByTestId('custom-icon')).toBeNull();
  });

  it('renders with custom icon when provided in config', () => {
    const mockPayload = [{ value: 'revenue', dataKey: 'revenue', color: '#2563eb' }];

    const configWithIcon: ChartConfig = {
      revenue: {
        label: 'Revenue',
        color: '#2563eb',
        icon: () => <span data-testid="custom-icon">★</span>,
      },
    };

    render(
      <ChartContainer config={configWithIcon}>
        <ChartLegendContent payload={mockPayload} />
      </ChartContainer>
    );

    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('filters out items with type "none"', () => {
    const mockPayload = [
      { value: 'revenue', dataKey: 'revenue', color: '#2563eb', type: 'none' as const },
    ];

    render(
      <ChartContainer config={testConfig}>
        <ChartLegendContent payload={mockPayload} />
      </ChartContainer>
    );

    expect(screen.queryByText('Revenue')).toBeNull();
  });

  it('renders with verticalAlign top', () => {
    const mockPayload = [{ value: 'revenue', dataKey: 'revenue', color: '#2563eb' }];

    const { container } = render(
      <ChartContainer config={testConfig}>
        <ChartLegendContent payload={mockPayload} verticalAlign="top" />
      </ChartContainer>
    );

    // Should have pb-3 class for top alignment
    expect(container.querySelector('.pb-3')).toBeInTheDocument();
  });

  it('renders with verticalAlign bottom', () => {
    const mockPayload = [{ value: 'revenue', dataKey: 'revenue', color: '#2563eb' }];

    const { container } = render(
      <ChartContainer config={testConfig}>
        <ChartLegendContent payload={mockPayload} verticalAlign="bottom" />
      </ChartContainer>
    );

    // Should have pt-3 class for bottom alignment
    expect(container.querySelector('.pt-3')).toBeInTheDocument();
  });
});

describe('useChart hook error', () => {
  it('throws error when used outside ChartContainer context', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<ChartTooltipContent active payload={[{ value: 1, name: 'test' }]} />);
    }).toThrow('useChart must be used within a <ChartContainer />');

    consoleSpy.mockRestore();
  });
});
