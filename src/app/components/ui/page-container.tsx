/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { cn } from '@/lib/utils';

const PageContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={cn('mx-auto flex min-h-full w-full flex-1 flex-col', className)}>
      {children}
    </div>
  );
};

export default PageContainer;
