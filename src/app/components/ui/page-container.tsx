import { cn } from '@/lib/utils';

const PageContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={cn('mx-auto min-h-full flex flex-col w-full flex-1', className)}>
      {children}
    </div>
  );
};

export default PageContainer;
