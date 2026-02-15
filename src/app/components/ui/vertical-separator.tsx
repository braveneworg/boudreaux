/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { cn } from '@/lib/utils/tailwind-utils';

import { Separator } from './separator';

const VerticalSeparator = ({ className }: { className?: string }) => {
  return <Separator className={cn('mx-px h-10', className)} orientation="vertical" />;
};

export default VerticalSeparator;
