/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { cn } from '@/lib/utils/tailwind-utils';

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

const levelStyles: Record<number, string> = {
  1: 'pt-2 px-4 h-13 mb-0 leading-tight',
  2: 'pt-3 px-4 h-11 mb-0 leading-tight',
  3: 'pt-2 px-4 h-9 mb-0 leading-tight',
  4: 'pt-2 px-4 h-8 mb-0 leading-snug',
  5: 'pt-1 px-4 h-7 mb-0 leading-snug',
  6: 'pt-1 px-4 h-6 mb-0 leading-snug',
};

const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ className, level = 1, ...props }, ref) => {
    const levelStyle = levelStyles[level];
    const combinedClassName = cn(levelStyle, className);

    switch (level) {
      case 1:
        return <h1 ref={ref} className={combinedClassName} {...props} />;
      case 2:
        return <h2 ref={ref} className={combinedClassName} {...props} />;
      case 3:
        return <h3 ref={ref} className={combinedClassName} {...props} />;
      case 4:
        return <h4 ref={ref} className={combinedClassName} {...props} />;
      case 5:
        return <h5 ref={ref} className={combinedClassName} {...props} />;
      case 6:
        return <h6 ref={ref} className={combinedClassName} {...props} />;
      default:
        return <h1 ref={ref} className={combinedClassName} {...props} />;
    }
  }
);
Heading.displayName = 'Heading';

export { Heading };
