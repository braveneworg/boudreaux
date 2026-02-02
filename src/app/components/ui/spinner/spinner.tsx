import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const spinnerVariants = cva(
  'relative animate-spin rounded-full before:absolute before:left-1/2 before:top-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:bg-transparent before:content-[""]',
  {
    variants: {
      size: {
        sm: 'h-4 w-4 before:h-3.5 before:w-3.5',
        md: 'h-[50px] w-[50px] before:h-10 before:w-10',
        lg: 'h-[70px] w-[70px] before:h-[58px] before:w-[58px]',
      },
      variant: {
        default: '[background:conic-gradient(#fff_0%,#ccc_25%,#666_50%,#000_75%,#fff_100%)]',
        primary:
          '[background:conic-gradient(hsl(var(--primary))_0%,hsl(var(--primary)/0.7)_25%,hsl(var(--primary)/0.4)_50%,transparent_75%,hsl(var(--primary))_100%)]',
        secondary:
          '[background:conic-gradient(hsl(var(--secondary))_0%,hsl(var(--secondary)/0.7)_25%,hsl(var(--secondary)/0.4)_50%,transparent_75%,hsl(var(--secondary))_100%)]',
        accent:
          '[background:conic-gradient(hsl(var(--accent))_0%,hsl(var(--accent)/0.7)_25%,hsl(var(--accent)/0.4)_50%,transparent_75%,hsl(var(--accent))_100%)]',
      },
    },
    defaultVariants: {
      size: 'sm',
      variant: 'default',
    },
  }
);

export interface SpinnerProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof spinnerVariants> {}

const Spinner = ({ className, size = 'sm', variant, ...props }: SpinnerProps) => {
  return (
    <div
      className={cn(spinnerVariants({ size, variant }), className)}
      aria-label="Loading spinner"
      {...props}
    />
  );
};

export { Spinner, spinnerVariants };
