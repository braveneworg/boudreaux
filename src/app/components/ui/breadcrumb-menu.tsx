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
import { cn } from '@/app/lib/utils/tailwind-utils';

type BreadcrumbItem = {
  anchorText: string;
  url: string;
  isActive: boolean;
};

type BreadcrumbMenuProps = {
  items: BreadcrumbItem[];
  className?: string;
};

export function BreadcrumbMenu({ items, className }: BreadcrumbMenuProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
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
