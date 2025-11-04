import React from 'react';

type PageSectionParagraphProps = {
  children: React.ReactNode;
  className?: string;
};

export const PageSectionParagraph = ({
  children,
  className = 'mb-4 text-zinc-700 leading-relaxed text-lg',
}: PageSectionParagraphProps) => {
  return <p className={className}>{children}</p>;
};
