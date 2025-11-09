import { type VariantProps, cva } from 'class-variance-authority';

import { cn } from '@/app/lib/utils';

const spinnerRingCircleVariants = cva(
  'animate-spin rounded-full border-2 [border-top-color:rgb(140,140,145)] [border-right-color:rgb(90,90,95)] [border-bottom-color:rgb(40,40,45)] [border-left-color:rgb(10,10,15)]',
  {
    variants: {
      size: {
        sm: 'h-[16px] w-[16px]',
        md: 'h-[50px] w-[50px]',
        lg: 'h-[70px] w-[70px]',
      },
      variant: {
        default:
          '[border-top-color:rgb(140,140,145)] [border-right-color:rgb(90,90,95)] [border-bottom-color:rgb(40,40,45)] [border-left-color:rgb(10,10,15)]',
        primary:
          '[border-top-color:hsl(var(--primary))] [border-right-color:hsl(var(--primary)/0.7)] [border-bottom-color:hsl(var(--primary)/0.4)] [border-left-color:hsl(var(--primary)/0.2)]',
        secondary:
          '[border-top-color:hsl(var(--secondary))] [border-right-color:hsl(var(--secondary)/0.7)] [border-bottom-color:hsl(var(--secondary)/0.4)] [border-left-color:hsl(var(--secondary)/0.2)]',
        accent:
          '[border-top-color:hsl(var(--accent))] [border-right-color:hsl(var(--accent)/0.7)] [border-bottom-color:hsl(var(--accent)/0.4)] [border-left-color:hsl(var(--accent)/0.2)]',
      },
    },
    defaultVariants: {
      size: 'sm',
      variant: 'default',
    },
  }
);

export interface SpinnerRingCircleProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof spinnerRingCircleVariants> {}

const SpinnerRingCircle = ({
  className,
  size = 'sm',
  variant,
  ...props
}: SpinnerRingCircleProps) => {
  return (
    <div
      className={cn(
        'flex justify-center items-center',
        spinnerRingCircleVariants({ size, variant }),
        className
      )}
      aria-label="Loading spinner"
      {...props}
    />
  );
};

export { SpinnerRingCircle, spinnerRingCircleVariants as spinnerVariants };
