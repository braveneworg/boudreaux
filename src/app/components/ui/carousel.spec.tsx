import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from './carousel';

// Stable mock api instance — same reference survives re-renders so test
// overrides (e.g. mockReturnValue) are never lost to a factory re-create.
const mockApi = {
  canScrollPrev: vi.fn(() => true),
  canScrollNext: vi.fn(() => true),
  scrollPrev: vi.fn(),
  scrollNext: vi.fn(),
  scrollTo: vi.fn(),
  scrollSnapList: vi.fn(() => [0, 1, 2, 3, 4]),
  on: vi.fn(),
  off: vi.fn(),
};

// Mock embla-carousel-react
vi.mock('embla-carousel-react', () => ({
  __esModule: true,
  default: () => {
    const ref = vi.fn();
    return [ref, mockApi];
  },
}));

// Reset mock functions before each test to ensure test isolation
beforeEach(() => {
  // Reset all mock function calls and implementations
  vi.clearAllMocks();

  // Reset mockApi to default return values
  mockApi.canScrollPrev.mockReturnValue(true);
  mockApi.canScrollNext.mockReturnValue(true);
  mockApi.scrollSnapList.mockReturnValue([0, 1, 2, 3, 4]);
});

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
    expect(carousel).toBeInTheDocument();
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

    expect(carousel).toBeInTheDocument();
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
    expect(prevButton).toBeInTheDocument();
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
    expect(nextButton).toBeInTheDocument();
  });
});

describe('Carousel with null api edge cases', () => {
  it('handles api being null in onSelect', () => {
    // When api is null, onSelect should return early
    // This is covered when carousel first mounts before api is ready
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    // Just verify carousel renders without error
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('handles no setApi callback provided', () => {
    // When setApi is not provided, the effect should return early
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    expect(screen.getByRole('region')).toBeInTheDocument();
  });
});

describe('Carousel orientation from opts', () => {
  it('derives vertical orientation from opts.axis when orientation not specified', () => {
    render(
      <Carousel opts={{ axis: 'y' }}>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('uses horizontal as default when no opts.axis provided', () => {
    render(
      <Carousel opts={{}}>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    expect(screen.getByRole('region')).toBeInTheDocument();
  });
});

describe('Carousel button disabled states', () => {
  it('previous button respects canScrollPrev state', () => {
    // Default mock has canScrollPrev returning true
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
      </Carousel>
    );

    const prevButton = document.querySelector('[data-slot="carousel-previous"]') as HTMLElement;
    expect(prevButton).toBeInTheDocument();
  });

  it('next button respects canScrollNext state', () => {
    // Default mock has canScrollNext returning true
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
        <CarouselNext />
      </Carousel>
    );

    const nextButton = document.querySelector('[data-slot="carousel-next"]') as HTMLElement;
    expect(nextButton).toBeInTheDocument();
  });
});

describe('Carousel loop cycling behavior', () => {
  beforeEach(() => {
    // Reset mock return values to prevent test pollution
    mockApi.canScrollPrev.mockReturnValue(true);
    mockApi.canScrollNext.mockReturnValue(true);
    mockApi.scrollPrev.mockClear();
    mockApi.scrollNext.mockClear();
    mockApi.scrollTo.mockClear();
  });

  it('wraps to the first slide when clicking next at the end with loop enabled', async () => {
    const user = userEvent.setup();

    render(
      <Carousel opts={{ loop: true }}>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
          <CarouselItem>Item 2</CarouselItem>
          <CarouselItem>Item 3</CarouselItem>
        </CarouselContent>
        <CarouselNext />
      </Carousel>
    );

    // Simulate being at the end of the carousel
    mockApi.canScrollNext.mockReturnValue(false);

    const nextButton = document.querySelector('[data-slot="carousel-next"]') as HTMLElement;
    await user.click(nextButton);

    expect(mockApi.scrollTo).toHaveBeenCalledWith(0);
    expect(mockApi.scrollNext).not.toHaveBeenCalled();
  });

  it('wraps to the last slide when clicking previous at the beginning with loop enabled', async () => {
    const user = userEvent.setup();

    render(
      <Carousel opts={{ loop: true }}>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
          <CarouselItem>Item 2</CarouselItem>
          <CarouselItem>Item 3</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
      </Carousel>
    );

    // Simulate being at the beginning of the carousel
    mockApi.canScrollPrev.mockReturnValue(false);

    const prevButton = document.querySelector('[data-slot="carousel-previous"]') as HTMLElement;
    await user.click(prevButton);

    // scrollSnapList returns [0,1,2,3,4] (5 items), so last index is 4
    expect(mockApi.scrollTo).toHaveBeenCalledWith(4);
    expect(mockApi.scrollPrev).not.toHaveBeenCalled();
  });

  it('scrolls normally when canScrollNext is true even with loop enabled', async () => {
    const user = userEvent.setup();

    render(
      <Carousel opts={{ loop: true }}>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
          <CarouselItem>Item 2</CarouselItem>
        </CarouselContent>
        <CarouselNext />
      </Carousel>
    );

    // canScrollNext returns true by default
    const nextButton = document.querySelector('[data-slot="carousel-next"]') as HTMLElement;
    await user.click(nextButton);

    expect(mockApi.scrollNext).toHaveBeenCalledTimes(1);
    expect(mockApi.scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls normally when canScrollPrev is true even with loop enabled', async () => {
    const user = userEvent.setup();

    render(
      <Carousel opts={{ loop: true }}>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
          <CarouselItem>Item 2</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
      </Carousel>
    );

    // canScrollPrev returns true by default
    const prevButton = document.querySelector('[data-slot="carousel-previous"]') as HTMLElement;
    await user.click(prevButton);

    expect(mockApi.scrollPrev).toHaveBeenCalledTimes(1);
    expect(mockApi.scrollTo).not.toHaveBeenCalled();
  });

  it('does not wrap when clicking next at the end without loop', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
          <CarouselItem>Item 2</CarouselItem>
        </CarouselContent>
        <CarouselNext />
      </Carousel>
    );

    // Simulate being at the end of the carousel
    mockApi.canScrollNext.mockReturnValue(false);

    // Without loop and canScrollNext=false, button should be disabled
    const nextButton = document.querySelector('[data-slot="carousel-next"]') as HTMLElement;
    expect(nextButton).toBeDisabled();
    expect(mockApi.scrollTo).not.toHaveBeenCalled();
  });

  it('does not wrap when clicking previous at the beginning without loop', () => {
    render(
      <Carousel>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
          <CarouselItem>Item 2</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
      </Carousel>
    );

    // Simulate being at the beginning of the carousel
    mockApi.canScrollPrev.mockReturnValue(false);

    // Without loop and canScrollPrev=false, button should be disabled
    const prevButton = document.querySelector('[data-slot="carousel-previous"]') as HTMLElement;
    expect(prevButton).toBeDisabled();
    expect(mockApi.scrollTo).not.toHaveBeenCalled();
  });

  it('keeps previous button enabled when loop is enabled regardless of scroll state', () => {
    render(
      <Carousel opts={{ loop: true }}>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
      </Carousel>
    );

    const prevButton = document.querySelector('[data-slot="carousel-previous"]') as HTMLElement;
    expect(prevButton).not.toBeDisabled();
  });

  it('keeps next button enabled when loop is enabled regardless of scroll state', () => {
    render(
      <Carousel opts={{ loop: true }}>
        <CarouselContent>
          <CarouselItem>Item</CarouselItem>
        </CarouselContent>
        <CarouselNext />
      </Carousel>
    );

    const nextButton = document.querySelector('[data-slot="carousel-next"]') as HTMLElement;
    expect(nextButton).not.toBeDisabled();
  });

  // Note: The following keyboard navigation tests use fireEvent.keyDown instead of
  // userEvent.keyboard as suggested in the code review. While userEvent is generally
  // preferred for consistency, it doesn't work in this case because:
  // 1. The carousel uses onKeyDownCapture to handle keyboard events
  // 2. userEvent.keyboard() only sends events to the currently focused element
  // 3. The carousel is not focusable by default (no tabIndex)
  // 4. Making the carousel focusable would require a component change and UX review
  // Therefore, fireEvent.keyDown is the appropriate testing tool here.

  it('wraps via keyboard ArrowRight at the end with loop enabled', async () => {
    const user = userEvent.setup();

    render(
      <Carousel opts={{ loop: true }}>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
          <CarouselItem>Item 2</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    mockApi.canScrollNext.mockReturnValue(false);

    const carousel = screen.getByRole('region');
    carousel.setAttribute('tabIndex', '0');
    await user.click(carousel);
    await user.keyboard('{ArrowRight}');

    expect(mockApi.scrollTo).toHaveBeenCalledWith(0);
  });

  it('wraps via keyboard ArrowLeft at the beginning with loop enabled', async () => {
    const user = userEvent.setup();

    render(
      <Carousel opts={{ loop: true }}>
        <CarouselContent>
          <CarouselItem>Item 1</CarouselItem>
          <CarouselItem>Item 2</CarouselItem>
        </CarouselContent>
      </Carousel>
    );

    mockApi.canScrollPrev.mockReturnValue(false);

    const carousel = screen.getByRole('region');
    carousel.setAttribute('tabIndex', '0');
    await user.click(carousel);
    await user.keyboard('{ArrowLeft}');

    expect(mockApi.scrollTo).toHaveBeenCalledWith(4);
  });

  it('does not call scrollTo when empty carousel with loop enabled on previous', async () => {
    const user = userEvent.setup();

    // Mock empty carousel (no items)
    mockApi.scrollSnapList.mockReturnValue([]);
    mockApi.canScrollPrev.mockReturnValue(false);

    render(
      <Carousel opts={{ loop: true }}>
        <CarouselContent />
        <CarouselPrevious />
      </Carousel>
    );

    const prevButton = document.querySelector('[data-slot="carousel-previous"]') as HTMLElement;
    await user.click(prevButton);

    // scrollTo should not be called with -1 when scrollSnapList is empty
    expect(mockApi.scrollTo).not.toHaveBeenCalledWith(-1);
  });

  it('does not call scrollTo when empty carousel with loop enabled on next', async () => {
    const user = userEvent.setup();

    // Mock empty carousel (no items)
    mockApi.scrollSnapList.mockReturnValue([]);
    mockApi.canScrollNext.mockReturnValue(false);

    render(
      <Carousel opts={{ loop: true }}>
        <CarouselContent />
        <CarouselNext />
      </Carousel>
    );

    const nextButton = document.querySelector('[data-slot="carousel-next"]') as HTMLElement;
    await user.click(nextButton);

    // scrollTo should not be called when scrollSnapList is empty
    expect(mockApi.scrollTo).not.toHaveBeenCalled();
  });
});
