/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

type PageSectionParagraphProps = {
  children: React.ReactNode;
  className?: string;
};

export const PageSectionParagraph = ({
  children,
  className = 'mb-4 text-zinc-700 leading-relaxed text-lg mt-0 pt-0',
}: PageSectionParagraphProps) => {
  return <p className={className}>{children}</p>;
};
