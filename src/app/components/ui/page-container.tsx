import { cn } from '@/app/lib/utils';

const PageContainer = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={cn('flex-1 mx-auto min-h-full flex flex-col w-full', className)}>
      {children}
    </div>
  );
};

export default PageContainer;
