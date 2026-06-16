/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from 'lucide-react';

import type { Button } from '@/app/components/ui/button';
import { buttonVariants } from '@/app/components/ui/button';
import { cn } from '@/lib/utils';

const Pagination = ({ className, ...props }: React.ComponentProps<'nav'>) => (
  <nav
    role="navigation"
    aria-label="pagination"
    data-slot="pagination"
    className={cn('mx-auto flex w-full justify-center', className)}
    {...props}
  />
);

const PaginationContent = ({ className, ...props }: React.ComponentProps<'ul'>) => (
  <ul
    data-slot="pagination-content"
    className={cn('flex flex-row items-center gap-1', className)}
    {...props}
  />
);

const PaginationItem = ({ ...props }: React.ComponentProps<'li'>) => (
  <li data-slot="pagination-item" {...props} />
);

type PaginationLinkProps = {
  isActive?: boolean;
} & Pick<React.ComponentProps<typeof Button>, 'size'> &
  React.ComponentProps<'a'>;

const PaginationLink = ({ className, isActive, size = 'icon', ...props }: PaginationLinkProps) => (
  // eslint-disable-next-line jsx-a11y/anchor-has-content -- content provided via spread props by consumers
  <a
    aria-current={isActive ? 'page' : undefined}
    data-slot="pagination-link"
    data-active={isActive}
    className={cn(
      buttonVariants({
        variant: isActive ? 'outline' : 'ghost',
        size,
      }),
      className
    )}
    {...props}
  />
);

const PaginationPrevious = ({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) => (
  <PaginationLink
    aria-label="Go to previous page"
    size="default"
    className={cn('gap-1 px-2.5 sm:pl-2.5', className)}
    {...props}
  >
    <ChevronLeftIcon />
    <span className="hidden sm:block">Previous</span>
  </PaginationLink>
);

const PaginationNext = ({ className, ...props }: React.ComponentProps<typeof PaginationLink>) => (
  <PaginationLink
    aria-label="Go to next page"
    size="default"
    className={cn('gap-1 px-2.5 sm:pr-2.5', className)}
    {...props}
  >
    <span className="hidden sm:block">Next</span>
    <ChevronRightIcon />
  </PaginationLink>
);

const PaginationEllipsis = ({ className, ...props }: React.ComponentProps<'span'>) => (
  <span
    aria-hidden
    data-slot="pagination-ellipsis"
    className={cn('flex size-9 items-center justify-center', className)}
    {...props}
  >
    <MoreHorizontalIcon className="size-4" />
    <span className="sr-only">More pages</span>
  </span>
);

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
