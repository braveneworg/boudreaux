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

type BreadcrumbItem = {
  anchorText: string;
  url: string;
  isActive: boolean;
};

type BreadcrumbMenuProps = {
  items: BreadcrumbItem[];
};

export function BreadcrumbMenu({ items }: BreadcrumbMenuProps) {
  return (
    <div className="flex items-center gap-2">
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
