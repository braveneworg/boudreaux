/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { cn } from '@/lib/utils/tailwind-utils';

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  ref?: React.Ref<HTMLHeadingElement>;
}

const levelStyles: Record<number, string> = {
  1: 'text-2xl pt-[18px] px-0 h-[52px] mb-0 leading-tight',
  2: 'text-xl pt-3 px-0 h-11 mb-0 leading-tight',
  3: 'text-base pt-2 px-0 h-9 mb-0 leading-tight',
  4: 'text-sm pt-2 px-0 h-8 mb-0 leading-snug',
  5: 'text-xs pt-1 px-0 h-7 mb-0 leading-snug',
  6: 'text-xs pt-1 px-0 h-6 mb-0 leading-snug',
};

const Heading = ({ className, level = 1, ref, children, ...props }: HeadingProps) => {
  const levelStyle = levelStyles[level];
  const combinedClassName = cn(levelStyle, className);

  switch (level) {
    case 1:
      return (
        <h1 ref={ref} className={combinedClassName} {...props}>
          {children}
        </h1>
      );
    case 2:
      return (
        <h2 ref={ref} className={combinedClassName} {...props}>
          {children}
        </h2>
      );
    case 3:
      return (
        <h3 ref={ref} className={combinedClassName} {...props}>
          {children}
        </h3>
      );
    case 4:
      return (
        <h4 ref={ref} className={combinedClassName} {...props}>
          {children}
        </h4>
      );
    case 5:
      return (
        <h5 ref={ref} className={combinedClassName} {...props}>
          {children}
        </h5>
      );
    case 6:
      return (
        <h6 ref={ref} className={combinedClassName} {...props}>
          {children}
        </h6>
      );
    default:
      return (
        <h1 ref={ref} className={combinedClassName} {...props}>
          {children}
        </h1>
      );
  }
};

export { Heading };
