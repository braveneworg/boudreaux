import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/app/lib/utils';

import { SpinnerRingCircle } from './spinner-ring-circle';

export type SpinnerSize = 'sm' | 'md' | 'lg';

const defaultVariants = {
  size: 'sm' as SpinnerSize,
};

const messageSpinnerVariants = cva('flex justify-center items-center', {
  variants: {
    size: {
      sm: 'gap-2',
      md: 'gap-4',
      lg: 'gap-6',
    },
  },
  defaultVariants,
});

const titleVariants = cva('text-muted-foreground', {
  variants: {
    size: {
      sm: 'text-sm',
      md: 'text-lg',
      lg: 'text-2xl',
    },
  },
  defaultVariants,
});

const containerVariants = cva('flex items-center justify-center rounded-lg', {
  variants: {
    size: {
      sm: 'h-[16px] w-[16px]',
      md: 'h-[28px] w-[28px]',
      lg: 'h-[36px] w-[36px]',
    },
  },
  defaultVariants,
});

// Why const assertion object pattern instead of enum? Because you get both type safety and autocomplete in editors without the runtime cost of enums
// SCREAMING_SNAKE_CASE to indicate it's a constant object and distinguish it from the type SpinnerPosition that uses it
export const SPINNER_POSITION = {
  before: 'before',
  after: 'after',
} as const;

export const SPINNER_VARIANT = {
  default: 'default',
  primary: 'primary',
  secondary: 'secondary',
  accent: 'accent',
} as const;

type SpinnerPosition = (typeof SPINNER_POSITION)[keyof typeof SPINNER_POSITION];
type SpinnerVariant = (typeof SPINNER_VARIANT)[keyof typeof SPINNER_VARIANT];

interface MessageSpinnerProps extends VariantProps<typeof messageSpinnerVariants> {
  className: string;
  message: string;
  size: SpinnerSize;
  spinnerPosition: SpinnerPosition;
  variant: SpinnerVariant;
}

export type OptionalMessageSpinnerProps = Partial<MessageSpinnerProps>;

const AnimatedEllipsis = () => {
  return (
    <span className="inline-flex">
      <span className="animate-[fadeIn_1.4s_ease-in-out_0s_infinite]">.</span>
      <span className="animate-[fadeIn_1.4s_ease-in-out_0.2s_infinite]">.</span>
      <span className="animate-[fadeIn_1.4s_ease-in-out_0.4s_infinite]">.</span>
    </span>
  );
};

export const MessageHeading2 = ({
  size,
  message = 'Loading',
}: Partial<{
  size: SpinnerSize;
  message: string;
}>) => {
  // Remove trailing ellipsis from message if present
  const cleanMessage = message.replace(/\.{3}$/, '').replace(/\.\.\.$/, '');

  return (
    <h2 className={cn('m-0 p-0 leading-tight', titleVariants({ size }))}>
      {cleanMessage}
      <AnimatedEllipsis />
    </h2>
  );
};

export const MessageSpinner = ({
  message,
  size,
  className,
  variant = SPINNER_VARIANT.default,
  spinnerPosition = SPINNER_POSITION.before,
}: OptionalMessageSpinnerProps) => {
  return (
    <div className={cn(messageSpinnerVariants({ size }), className)}>
      {spinnerPosition === SPINNER_POSITION.before && (
        <div className={containerVariants({ size })}>
          <SpinnerRingCircle size={size} variant={variant} />
        </div>
      )}
      <MessageHeading2 size={size} message={message} />
      {spinnerPosition === SPINNER_POSITION.after && (
        <div className={containerVariants({ size })}>
          <SpinnerRingCircle size={size} variant={variant} />
        </div>
      )}
    </div>
  );
};
