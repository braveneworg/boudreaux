/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import {
  type ComponentProps,
  type KeyboardEvent,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import useEmblaCarousel, { type UseEmblaCarouselType } from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { cn } from '@/lib/utils';

type CarouselApi = UseEmblaCarouselType[1];
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>;
type CarouselOptions = UseCarouselParameters[0];
type CarouselPlugin = UseCarouselParameters[1];

type CarouselProps = {
  opts?: CarouselOptions;
  plugins?: CarouselPlugin;
  orientation?: 'horizontal' | 'vertical';
  setApi?: (api: CarouselApi) => void;
};

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0];
  api: ReturnType<typeof useEmblaCarousel>[1];
  scrollPrev: () => void;
  scrollNext: () => void;
  canScrollPrev: boolean;
  canScrollNext: boolean;
} & CarouselProps;

const CarouselContext = createContext<CarouselContextProps | null>(null);

function useCarousel() {
  const context = useContext(CarouselContext);

  if (!context) {
    throw Error('useCarousel must be used within a <Carousel />');
  }

  return context;
}
function Carousel({
  orientation = 'horizontal',
  opts,
  setApi,
  plugins,
  className,
  children,
  ...props
}: ComponentProps<'div'> & CarouselProps) {
  const [carouselRef, api] = useEmblaCarousel(
    {
      ...opts,
      axis: orientation === 'horizontal' ? 'x' : 'y',
    },
    plugins
  );
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const onSelect = useCallback((api: CarouselApi) => {
    if (!api) return;
    setCanScrollPrev(api.canScrollPrev());
    setCanScrollNext(api.canScrollNext());
  }, []);

  const loop = opts?.loop ?? false;

  const scrollPrev = useCallback(() => {
    if (!api) return;
    if (api.canScrollPrev()) {
      api.scrollPrev();
    } else if (loop) {
      const snapList = api.scrollSnapList();
      if (snapList.length > 0) {
        api.scrollTo(snapList.length - 1);
      }
    }
  }, [api, loop]);

  const scrollNext = useCallback(() => {
    if (!api) return;
    if (api.canScrollNext()) {
      api.scrollNext();
    } else if (loop) {
      const snapList = api.scrollSnapList();
      if (snapList.length > 0) {
        api.scrollTo(0);
      }
    }
  }, [api, loop]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        scrollPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        scrollNext();
      }
    },
    [scrollPrev, scrollNext]
  );

  useEffect(() => {
    if (!api || !setApi) return;
    setApi(api);
  }, [api, setApi]);

  useEffect(() => {
    if (!api) return;

    api.on('reInit', onSelect);
    api.on('select', onSelect);

    // Use requestAnimationFrame to defer initial state update
    const frameId = requestAnimationFrame(() => {
      onSelect(api);
    });

    return () => {
      cancelAnimationFrame(frameId);
      api?.off('select', onSelect);
    };
  }, [api, onSelect]);

  return (
    <CarouselContext.Provider
      value={{
        carouselRef,
        api,
        opts,
        orientation: orientation || (opts?.axis === 'y' ? 'vertical' : 'horizontal'),
        scrollPrev,
        scrollNext,
        canScrollPrev,
        canScrollNext,
      }}
    >
      <div
        onKeyDownCapture={handleKeyDown}
        className={cn('relative', className)}
        role="region"
        aria-roledescription="carousel"
        data-slot="carousel"
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  );
}

function CarouselContent({ className, ...props }: ComponentProps<'div'>) {
  const { carouselRef, orientation } = useCarousel();

  return (
    <div ref={carouselRef} className="min-w-0 flex-1 overflow-hidden" data-slot="carousel-content">
      <div
        className={cn('flex', orientation === 'horizontal' ? '' : '-mt-4 flex-col', className)}
        {...props}
      />
    </div>
  );
}

function CarouselItem({ className, onClick, ...props }: ComponentProps<'div'>) {
  const { orientation } = useCarousel();

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (onClick) {
        onClick(event);
      }
    },
    [onClick]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (onClick && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        onClick(event as unknown as React.MouseEvent<HTMLDivElement>);
      }
    },
    [onClick]
  );

  return (
    <>
      {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- role="group" required for carousel slide semantics; onClick is optional navigation */}
      <div
        onClick={handleClick}
        onKeyDown={onClick ? handleKeyDown : undefined}
        tabIndex={onClick ? 0 : undefined}
        role="group"
        aria-roledescription="slide"
        data-slot="carousel-item"
        className={cn(
          'min-w-0 shrink-0 grow-0',
          orientation === 'horizontal' ? '' : 'pt-4',
          className
        )}
        {...props}
      />
      {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
    </>
  );
}

function CarouselPrevious({
  className,
  variant = 'ghost',
  size = 'icon',
  ...props
}: ComponentProps<typeof Button>) {
  const { orientation, scrollPrev, canScrollPrev, opts } = useCarousel();

  return (
    <Button
      data-slot="carousel-previous"
      variant={variant}
      size={size}
      className={cn(
        'absolute z-15 size-8 rounded-full text-zinc-950',
        orientation === 'horizontal'
          ? 'top-1/2 left-0 -translate-y-1/2'
          : '-top-12 left-1/2 -translate-x-1/2 rotate-90',
        className
      )}
      disabled={!opts?.loop && !canScrollPrev}
      onClick={scrollPrev}
      {...props}
    >
      <ChevronLeft />
      <span className="sr-only">Previous slide</span>
    </Button>
  );
}

function CarouselNext({
  className,
  variant = 'ghost',
  size = 'icon',
  ...props
}: ComponentProps<typeof Button>) {
  const { orientation, scrollNext, canScrollNext, opts } = useCarousel();

  return (
    <Button
      data-slot="carousel-next"
      variant={variant}
      size={size}
      className={cn(
        'absolute z-15 size-8 rounded-full text-zinc-950',
        orientation === 'horizontal'
          ? 'top-1/2 right-0 -translate-y-1/2'
          : 'top-1/2 right-4 -mt-3 -translate-y-1/2',
        className
      )}
      disabled={!opts?.loop && !canScrollNext}
      onClick={scrollNext}
      {...props}
    >
      <ChevronRight />
      <span className="sr-only">Next slide</span>
    </Button>
  );
}

export {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
};
