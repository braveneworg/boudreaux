/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import * as React from 'react';

import * as RechartsPrimitive from 'recharts';

import { cn } from '@/lib/utils';

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: '', dark: '.dark' } as const;

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  );
};

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

const useChart = () => {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw Error('useChart must be used within a <ChartContainer />');
  }

  return context;
};

const ChartContainer = ({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<'div'> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>['children'];
}) => {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, '')}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
};

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(([, config]) => config.theme || config.color);

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color = itemConfig.theme?.[theme as keyof typeof itemConfig.theme] || itemConfig.color;
    return color ? `  --color-${key}: ${color};` : null;
  })
  .join('\n')}
}
`
          )
          .join('\n'),
      }}
    />
  );
};

const ChartTooltip = RechartsPrimitive.Tooltip;

/**
 * Shape of a single entry in a Recharts tooltip `payload`. Recharts 3 no longer
 * surfaces `active`/`payload`/`label` through the `Tooltip` component props
 * (they are read from context), so the tooltip content props are typed
 * explicitly here instead of intersecting with `RechartsPrimitive.Tooltip`.
 */
type ChartTooltipPayloadItem = {
  value?: number | string;
  name?: number | string;
  dataKey?: number | string;
  color?: string;
  type?: string;
  payload?: Record<string, unknown> & { fill?: string };
};

type TooltipLabelValueOptions = {
  config: ChartConfig;
  item: ChartTooltipPayloadItem | undefined;
  labelKey?: string;
  label?: React.ReactNode;
};

// Derives the lookup key for a payload item, falling back through dataKey/name.
const resolveItemKey = (
  explicitKey: string | undefined,
  item: ChartTooltipPayloadItem | undefined
): string => `${explicitKey || item?.dataKey || item?.name || 'value'}`;

// Resolves the rendered label value for a tooltip from config/payload/label.
const getTooltipLabelValue = ({
  config,
  item,
  labelKey,
  label,
}: TooltipLabelValueOptions): React.ReactNode => {
  if (!labelKey && typeof label === 'string') {
    return config[label as keyof typeof config]?.label || label;
  }

  const key = resolveItemKey(labelKey, item);
  const itemConfig = getPayloadConfigFromPayload(config, item, key);

  return itemConfig?.label;
};

type TooltipLabelOptions = {
  hideLabel: boolean;
  payload: ChartTooltipPayloadItem[] | undefined;
  config: ChartConfig;
  label?: React.ReactNode;
  labelKey?: string;
  labelClassName?: string;
  labelFormatter?: (value: React.ReactNode, payload: ChartTooltipPayloadItem[]) => React.ReactNode;
};

// Renders the tooltip label node (or null) from the supplied options.
const renderTooltipLabel = ({
  hideLabel,
  payload,
  config,
  label,
  labelKey,
  labelClassName,
  labelFormatter,
}: TooltipLabelOptions): React.ReactNode => {
  if (hideLabel || !payload?.length) {
    return null;
  }

  const [item] = payload;
  const value = getTooltipLabelValue({ config, item, labelKey, label });

  if (labelFormatter) {
    return (
      <div className={cn('font-medium', labelClassName)}>{labelFormatter(value, payload)}</div>
    );
  }

  if (!value) {
    return null;
  }

  return <div className={cn('font-medium', labelClassName)}>{value}</div>;
};

type ChartTooltipIndicatorKind = 'line' | 'dot' | 'dashed';

type ChartTooltipFormatter = (
  value: number | string | undefined,
  name: number | string,
  item: ChartTooltipPayloadItem,
  index: number,
  itemPayload: ChartTooltipPayloadItem['payload']
) => React.ReactNode;

type ChartTooltipIndicatorProps = {
  itemConfig: ReturnType<typeof getPayloadConfigFromPayload>;
  hideIndicator: boolean;
  indicator: ChartTooltipIndicatorKind;
  indicatorColor: string | undefined;
  nestLabel: boolean;
};

// Renders the per-item colour indicator (icon, dot, line, or dashed marker).
const ChartTooltipIndicator = ({
  itemConfig,
  hideIndicator,
  indicator,
  indicatorColor,
  nestLabel,
}: ChartTooltipIndicatorProps) => {
  if (itemConfig?.icon) {
    return <itemConfig.icon />;
  }

  if (hideIndicator) {
    return null;
  }

  return (
    <div
      className={cn('shrink-0 border-(--color-border) bg-(--color-bg)', {
        'h-2.5 w-2.5': indicator === 'dot',
        'w-1': indicator === 'line',
        'w-0 border-[1.5px] border-dashed bg-transparent': indicator === 'dashed',
        'my-0.5': nestLabel && indicator === 'dashed',
      })}
      style={
        {
          '--color-bg': indicatorColor,
          '--color-border': indicatorColor,
        } as React.CSSProperties
      }
    />
  );
};

// Renders the numeric/string value on the right of a tooltip row.
const ChartTooltipItemValue = ({ value }: { value?: number | string }) => {
  if (value === undefined) {
    return null;
  }

  return (
    <span className="text-foreground font-mono font-medium tabular-nums">
      {typeof value === 'number' ? value.toLocaleString() : value}
    </span>
  );
};

type ChartTooltipItemBodyProps = {
  item: ChartTooltipPayloadItem;
  itemConfig: ReturnType<typeof getPayloadConfigFromPayload>;
  indicator: ChartTooltipIndicatorKind;
  hideIndicator: boolean;
  indicatorColor: string | undefined;
  nestLabel: boolean;
  tooltipLabel: React.ReactNode;
};

// Default (non-formatter) body of a tooltip row: indicator + label + value.
const ChartTooltipItemBody = ({
  item,
  itemConfig,
  indicator,
  hideIndicator,
  indicatorColor,
  nestLabel,
  tooltipLabel,
}: ChartTooltipItemBodyProps) => (
  <>
    <ChartTooltipIndicator
      itemConfig={itemConfig}
      hideIndicator={hideIndicator}
      indicator={indicator}
      indicatorColor={indicatorColor}
      nestLabel={nestLabel}
    />
    <div
      className={cn(
        'flex flex-1 justify-between leading-none',
        nestLabel ? 'items-end' : 'items-center'
      )}
    >
      <div className="grid gap-1.5">
        {nestLabel ? tooltipLabel : null}
        <span className="text-zinc-950">{itemConfig?.label || item.name}</span>
      </div>
      <ChartTooltipItemValue value={item.value} />
    </div>
  </>
);

type ChartTooltipItemProps = {
  item: ChartTooltipPayloadItem;
  index: number;
  config: ChartConfig;
  color?: string;
  indicator: ChartTooltipIndicatorKind;
  hideIndicator: boolean;
  nameKey?: string;
  formatter?: ChartTooltipFormatter;
  nestLabel: boolean;
  tooltipLabel: React.ReactNode;
};

// Derives the tooltip row lookup key, preferring nameKey then the item's own fields.
const resolveTooltipItemKey = (
  nameKey: string | undefined,
  item: ChartTooltipPayloadItem
): string => `${nameKey || item.name || item.dataKey || 'value'}`;

// Resolves the indicator colour for a tooltip row.
const resolveIndicatorColor = (
  color: string | undefined,
  item: ChartTooltipPayloadItem
): string | undefined => color || item.payload?.fill || item.color;

// Renders a single row within the tooltip content.
const ChartTooltipItem = ({
  item,
  index,
  config,
  color,
  indicator,
  hideIndicator,
  nameKey,
  formatter,
  nestLabel,
  tooltipLabel,
}: ChartTooltipItemProps) => {
  const key = resolveTooltipItemKey(nameKey, item);
  const itemConfig = getPayloadConfigFromPayload(config, item, key);
  const indicatorColor = resolveIndicatorColor(color, item);

  return (
    <div
      className={cn(
        'flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-zinc-950',
        indicator === 'dot' && 'items-center'
      )}
    >
      {formatter && item?.value !== undefined && item.name ? (
        formatter(item.value, item.name, item, index, item.payload)
      ) : (
        <ChartTooltipItemBody
          item={item}
          itemConfig={itemConfig}
          indicator={indicator}
          hideIndicator={hideIndicator}
          indicatorColor={indicatorColor}
          nestLabel={nestLabel}
          tooltipLabel={tooltipLabel}
        />
      )}
    </div>
  );
};

const ChartTooltipContent = ({
  active,
  payload,
  className,
  indicator = 'dot',
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: React.ComponentProps<'div'> & {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  label?: React.ReactNode;
  labelClassName?: string;
  labelFormatter?: (value: React.ReactNode, payload: ChartTooltipPayloadItem[]) => React.ReactNode;
  formatter?: ChartTooltipFormatter;
  color?: string;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  indicator?: ChartTooltipIndicatorKind;
  nameKey?: string;
  labelKey?: string;
}) => {
  const { config } = useChart();

  const tooltipLabel = React.useMemo(
    () =>
      renderTooltipLabel({
        hideLabel,
        payload,
        config,
        label,
        labelKey,
        labelClassName,
        labelFormatter,
      }),
    [label, labelFormatter, payload, hideLabel, labelClassName, config, labelKey]
  );

  if (!active || !payload?.length) {
    return null;
  }

  const nestLabel = payload.length === 1 && indicator !== 'dot';

  return (
    <div
      className={cn(
        'border-border/50 bg-background grid min-w-32 items-start gap-1.5 border px-2.5 py-1.5 text-xs shadow-xl',
        className
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="grid gap-1.5">
        {payload
          .filter((item) => item.type !== 'none')
          .map((item, index) => (
            <ChartTooltipItem
              key={item.dataKey}
              item={item}
              index={index}
              config={config}
              color={color}
              indicator={indicator}
              hideIndicator={hideIndicator}
              nameKey={nameKey}
              formatter={formatter}
              nestLabel={nestLabel}
              tooltipLabel={tooltipLabel}
            />
          ))}
      </div>
    </div>
  );
};

const ChartLegend = RechartsPrimitive.Legend;

/** Shape of a single entry in a Recharts legend `payload` (typed explicitly for Recharts 3). */
type ChartLegendPayloadItem = {
  value?: number | string;
  dataKey?: number | string;
  color?: string;
  type?: string;
};

const ChartLegendContent = ({
  className,
  hideIcon = false,
  payload,
  verticalAlign = 'bottom',
  nameKey,
}: React.ComponentProps<'div'> & {
  payload?: ChartLegendPayloadItem[];
  verticalAlign?: 'top' | 'middle' | 'bottom';
  hideIcon?: boolean;
  nameKey?: string;
}) => {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-4',
        verticalAlign === 'top' ? 'pb-3' : 'pt-3',
        className
      )}
    >
      {payload
        .filter((item) => item.type !== 'none')
        .map((item) => {
          const key = `${nameKey || item.dataKey || 'value'}`;
          const itemConfig = getPayloadConfigFromPayload(config, item, key);

          return (
            <div
              key={item.value}
              className={cn(
                'flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-zinc-950'
              )}
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  className="h-2 w-2 shrink-0"
                  style={{
                    backgroundColor: item.color,
                  }}
                />
              )}
              {itemConfig?.label}
            </div>
          );
        })}
    </div>
  );
};

// Reads a string-valued property `key` from an object, returning undefined when
// the property is absent or not a string.
const readStringProp = (source: object, key: string): string | undefined => {
  if (key in source && typeof source[key as keyof typeof source] === 'string') {
    return source[key as keyof typeof source] as string;
  }

  return undefined;
};

// Helper to extract item config from a payload.
const getPayloadConfigFromPayload = (config: ChartConfig, payload: unknown, key: string) => {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }

  const payloadPayload =
    'payload' in payload && typeof payload.payload === 'object' && payload.payload !== null
      ? payload.payload
      : undefined;

  const configLabelKey =
    readStringProp(payload, key) ??
    (payloadPayload ? readStringProp(payloadPayload, key) : undefined) ??
    key;

  return configLabelKey in config
    ? new Map(Object.entries(config)).get(configLabelKey)
    : config[key as keyof typeof config];
};

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
};
