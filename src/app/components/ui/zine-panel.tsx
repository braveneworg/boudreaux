/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { cn } from '@/lib/utils';

import { BreadcrumbMenu, type BreadcrumbItemData } from './breadcrumb-menu';
import { ChatPanelTrigger } from '../chat/chat-panel-trigger';

export type ZineAccent =
  | 'yellow'
  | 'hot-pink'
  | 'pink'
  | 'cyan'
  | 'tan'
  | 'orange'
  | 'green'
  | 'teal'
  | 'mustard'
  | 'kraft'
  | 'denim'
  | 'storm'
  | 'orchid';

/**
 * Literal accent → utility map. Never template-build these class names
 * (`zine-accent-${accent}`) — Tailwind v4 only emits classes it can see
 * as full literals in source. A Map (same pattern as Heading's levelStyles)
 * keeps the keyed lookup free of computed object access.
 */
const ACCENT_CLASS = new Map<ZineAccent, string>([
  ['yellow', 'zine-accent-yellow'],
  ['hot-pink', 'zine-accent-hot-pink'],
  ['pink', 'zine-accent-pink'],
  ['cyan', 'zine-accent-cyan'],
  ['tan', 'zine-accent-tan'],
  ['orange', 'zine-accent-orange'],
  ['green', 'zine-accent-green'],
  ['teal', 'zine-accent-teal'],
  ['mustard', 'zine-accent-mustard'],
  ['kraft', 'zine-accent-kraft'],
  ['denim', 'zine-accent-denim'],
  ['storm', 'zine-accent-storm'],
  ['orchid', 'zine-accent-orchid'],
]);

export interface ZinePanelProps extends React.ComponentProps<'section'> {
  accent: ZineAccent;
  tape?: boolean;
  contentClassName?: string;
  /** Breadcrumb trail rendered inside the panel, just above the content. */
  breadcrumbs?: BreadcrumbItemData[];
  /**
   * Dock the chat trigger inside this panel — it floats sticky at the
   * viewport bottom while the panel is in view and parks at the panel's
   * end. The global fixed trigger hides itself while a dock is present.
   */
  chat?: boolean;
}

/**
 * Full-content-width zine paper panel. The accent keys the page's
 * heading-strip color (sets `--card-accent` / `--card-accent-soft` on the
 * section itself so `shadow-zine` resolves there and cascades to all
 * descendants). `overflow-visible` is load-bearing for the tape — do not
 * wrap in Card, whose `overflow-hidden` clips it.
 */
export const ZinePanel = ({
  accent,
  tape = true,
  contentClassName,
  breadcrumbs,
  chat = false,
  className,
  children,
  ...props
}: ZinePanelProps): React.ReactElement => (
  <section
    data-slot="zine-panel"
    className={cn(
      'bg-menu-item-tan-100 shadow-zine relative mt-3 mb-4 w-full overflow-visible rounded-none border-2 border-black',
      ACCENT_CLASS.get(accent),
      className
    )}
    {...props}
  >
    {tape && (
      <span
        aria-hidden="true"
        className="bg-menu-item-yellow-200/85 absolute -top-3 left-1/2 z-20 h-6 w-28 -translate-x-1/2 -rotate-2 border border-black/25 shadow-[1px_1px_0_0_rgba(0,0,0,0.2)]"
      />
    )}
    <div
      className={cn(
        'relative z-10 p-6 pt-4 sm:p-8',
        // Pull the breadcrumb trail snug to the panel top — trim only the top
        // inset when a trail renders, leaving the horizontal/bottom padding.
        breadcrumbs && 'pt-3 sm:pt-4',
        contentClassName
      )}
    >
      {/* Panel padding supplies the horizontal offset — the trail drops its
          outside-the-panel nudge; vertical spacing stays the component's own. */}
      {breadcrumbs && <BreadcrumbMenu items={breadcrumbs} className="left-0" />}
      {children}
      {chat && <ChatPanelTrigger />}
    </div>
  </section>
);
