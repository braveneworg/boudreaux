import { cn } from '@/lib/utils/tailwind-utils';

import { Separator } from './separator';

const VerticalSeparator = ({ className }: { className?: string }) => {
  return <Separator className={cn('mx-1 h-10', className)} orientation="vertical" />;
};

export default VerticalSeparator;
