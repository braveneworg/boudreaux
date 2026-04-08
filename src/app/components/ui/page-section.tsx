/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { cn } from '@/lib/utils/tailwind-utils';

import { Heading } from './heading';

type PageSectionProps = {
  children: React.ReactNode;
  className?: string;
  id: string;
  title: string;
};

export const PageSection = ({ id, title, children, className }: PageSectionProps) => {
  return (
    <section className={cn(className, 'mt-8')} id={id}>
      <Heading level={2}>{title}</Heading>
      {children}
    </section>
  );
};
