/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Link from 'next/link';

import { Home } from 'lucide-react';

import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@/app/components/ui/breadcrumb';
import { cn } from '@/lib/utils/tailwind-utils';

type BreadcrumbItemData = {
  anchorText: string;
  url: string;
  isActive: boolean;
};

type BreadcrumbMenuProps = {
  items: BreadcrumbItemData[];
  className?: string;
};

export function BreadcrumbMenu({ items, className }: BreadcrumbMenuProps) {
  return (
    <div className={cn('flex items-center gap-2 my-2 relative left-5 text-sm', className)}>
      <Link href="/" className="hover:text-foreground text-muted-foreground transition-colors">
        <Home className="size-5" />
        <span className="sr-only">Home</span>
      </Link>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {items.map((item) => (
            <div key={`${item.url}-${item.anchorText}`} className="contents">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {item.isActive ? (
                  <BreadcrumbPage>{item.anchorText}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={item.url}>{item.anchorText}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </div>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
