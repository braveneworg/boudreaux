/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { ChartContainer } from './chart';

import type { ChartConfig } from './chart';

// Kept apart from chart.spec.tsx on purpose: that file stubs recharts'
// ResponsiveContainer module-wide, which hides the real container's
// first-render sizing — the source of the "width(-1) and height(-1) of chart
// should be greater than 0" console warning these cases guard against.

const DIMENSION_WARNING = 'should be greater than 0';

const config: ChartConfig = {
  published: { label: 'Published', color: 'var(--chart-1)' },
};

const measuredRect: DOMRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 640,
  bottom: 260,
  width: 640,
  height: 260,
  toJSON: () => ({}),
};

describe('ChartContainer dimensions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not warn about non-positive chart dimensions when it mounts', () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(measuredRect);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <ChartContainer config={config}>
        <div data-testid="chart-child" />
      </ChartContainer>
    );

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining(DIMENSION_WARNING));
  });

  it('server-renders its chart before the container has been measured', () => {
    const html = renderToString(
      <ChartContainer config={config}>
        <div data-testid="chart-child" />
      </ChartContainer>
    );

    expect(html).toContain('data-testid="chart-child"');
  });
});
