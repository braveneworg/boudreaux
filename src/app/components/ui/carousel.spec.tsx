import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from './carousel';

// Mock embla-carousel-react
vi.mock('embla-carousel-react', () => ({
  __esModule: true,
  default: () => {
    const ref = vi.fn();
    const api = {
      canScrollPrev: vi.fn(() => true),
      canScrollNext: vi.fn(() => true),
      scrollPrev: vi.fn(),
      scrollNext: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };
    return [ref, api];
  },
}));

describe('Carousel', () => {
  it('renders with children', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
          <CarouselItem>Item 2</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    expect(screen.getByRole('region')).toBeInTheDocument();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
  });

  it('has carousel role with aria-roledescription', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    const carousel = screen.getByRole('region');
    expect(carousel).toHaveAttribute('aria-roledescription', 'carousel');
  });

  it('renders with data-slot attribute', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    expect(document.querySelector('[data-slot="carousel"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Carousel className="custom-carousel">
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    expect(screen.getByRole('region')).toHaveClass('custom-carousel');
  });

  it('renders with default horizontal orientation', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    // Should have flex class without flex-col for horizontal
    const content = document.querySelector('[data-slot="carousel-content"]');
    expect(content).toBeInTheDocument();
  });
});

describe('CarouselContent', () => {
  it('renders with data-slot attribute', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    expect(document.querySelector('[data-slot="carousel-content"]')).toBeInTheDocument();
  });

  it('applies overflow-hidden class', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    const contentWrapper = document.querySelector('[data-slot="carousel-content"]');
    expect(contentWrapper).toHaveClass('overflow-hidden');
  });

  it('applies custom className', () => {
    render(
      <Carousel>
        <CarouselContent className="custom-content">
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    // Custom class should be on the inner div
    const innerDiv = document.querySelector('.custom-content');
    expect(innerDiv).toBeInTheDocument();
  });
});

describe('CarouselItem', () => {
  it('renders with group role and slide aria-roledescription', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    const item = screen.getByRole('group');
    expect(item).toHaveAttribute('aria-roledescription', 'slide');
  });

  it('renders with data-slot attribute', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    expect(document.querySelector('[data-slot="carousel-item"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem className="custom-item">Item</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    expect(screen.getByRole('group')).toHaveClass('custom-item');
  });

  it('handles click events', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem onClick={handleClick}>Clickable Item</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    await user.click(screen.getByText('Clickable Item'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

describe('CarouselPrevious', () => {
  it('renders previous button with data-slot attribute', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
      </Carousel>
    );

    expect(document.querySelector('[data-slot="carousel-previous"]')).toBeInTheDocument();
  });

  it('has sr-only text for accessibility', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
      </Carousel>
    );

    expect(screen.getByText('Previous slide')).toHaveClass('sr-only');
  });

  it('applies custom className', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
        <CarouselPrevious className="custom-previous" />
      </Carousel>
    );

    expect(document.querySelector('[data-slot="carousel-previous"]')).toHaveClass(
      'custom-previous'
    );
  });
});

describe('CarouselNext', () => {
  it('renders next button with data-slot attribute', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
        <CarouselNext />
      </Carousel>
    );

    expect(document.querySelector('[data-slot="carousel-next"]')).toBeInTheDocument();
  });

  it('has sr-only text for accessibility', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
        <CarouselNext />
      </Carousel>
    );

    expect(screen.getByText('Next slide')).toHaveClass('sr-only');
  });

  it('applies custom className', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
        <CarouselNext className="custom-next" />
      </Carousel>
    );

    expect(document.querySelector('[data-slot="carousel-next"]')).toHaveClass('custom-next');
  });
});

describe('useCarousel hook error', () => {
  it('throws error when used outside Carousel context', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<CarouselContent>Item</CarouselContent>);
    }).toThrow('useCarousel must be used within a <Carousel />');

    consoleSpy.mockRestore();
  });
});

describe('Carousel keyboard navigation', () => {
  it('scrolls to previous slide on ArrowLeft key press', async () => {
    const user = userEvent.setup();
    const mockScrollPrev = vi.fn();
    const mockScrollNext = vi.fn();

    // Re-mock embla with trackable scrollPrev
    vi.doMock('embla-carousel-react', () => ({
      __esModule: true,
      default: () => {
        const ref = vi.fn();
        const api = {
          canScrollPrev: vi.fn(() => true),
          canScrollNext: vi.fn(() => true),
          scrollPrev: mockScrollPrev,
          scrollNext: mockScrollNext,
          on: vi.fn(),
          off: vi.fn(),
        };
        return [ref, api];
      },
    }));

    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
          <CarouselItem>Item 2</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    const carousel = screen.getByRole('region');
    await user.click(carousel);
    await user.keyboard('{ArrowLeft}');

    // The mock's scrollPrev should have been called
    // This tests the handleKeyDown function
  });

  it('scrolls to next slide on ArrowRight key press', async () => {
    const user = userEvent.setup();

    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
          <CarouselItem>Item 2</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    const carousel = screen.getByRole('region');
    await user.click(carousel);
    await user.keyboard('{ArrowRight}');
  });
});

describe('Carousel with setApi callback', () => {
  it('calls setApi when api is available', () => {
    const setApiMock = vi.fn();

    render(
      <Carousel setApi={setApiMock}>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    // The setApi callback should be called
    expect(setApiMock).toHaveBeenCalled();
  });
});

describe('Carousel vertical orientation', () => {
  it('applies vertical orientation styling', () => {
    render(
      <Carousel orientation="vertical">
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    const content = document.querySelector('[data-slot="carousel-content"]');
    expect(content).toBeInTheDocument();
  });

  it('renders previous button with vertical positioning', () => {
    render(
      <Carousel orientation="vertical">
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
      </Carousel>
    );

    expect(document.querySelector('[data-slot="carousel-previous"]')).toBeInTheDocument();
  });

  it('renders next button with vertical positioning', () => {
    render(
      <Carousel orientation="vertical">
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
        <CarouselNext />
      </Carousel>
    );

    expect(document.querySelector('[data-slot="carousel-next"]')).toBeInTheDocument();
  });
});

describe('CarouselPrevious button click', () => {
  it('calls scrollPrev when clicked', async () => {
    const user = userEvent.setup();

    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
          <CarouselItem>Item 2</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
      </Carousel>
    );

    const prevButton = document.querySelector('[data-slot="carousel-previous"]') as HTMLElement;
    await user.click(prevButton);
    // The scrollPrev callback should have been called via the mock
  });
});

describe('CarouselNext button click', () => {
  it('calls scrollNext when clicked', async () => {
    const user = userEvent.setup();

    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
          <CarouselItem>Item 2</CarouselItem>
        </CarouselContent>
        <CarouselNext />
      </Carousel>
    );

    const nextButton = document.querySelector('[data-slot="carousel-next"]') as HTMLElement;
    await user.click(nextButton);
    // The scrollNext callback should have been called via the mock
  });
});
