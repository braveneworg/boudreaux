/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * L-shaped editorial rule for zine-page content: a black border on only the
 * left and bottom edges, padding inside so content stands off the rule, and
 * margin outside so the rule never presses against the surrounding
 * ZinePanel frame.
 */
export const ZineContentRule = ({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement => (
  <div
    data-slot="zine-content-rule"
    className={cn('m-2 border-b-2 border-l-2 border-black p-4 sm:m-3 sm:p-6', className)}
    {...props}
  >
    {children}
  </div>
);
