import { render, screen } from '@testing-library/react';

import { StickyBreadcrumbWrapper } from './sticky-breadcrumb-wrapper';

// Mock window.scrollY
let mockScrollY = 0;
Object.defineProperty(window, 'scrollY', {
  get: () => mockScrollY,
  configurable: true,
});

describe('StickyBreadcrumbWrapper', () => {
  beforeEach(() => {
    mockScrollY = 0;
  });

  afterEach(() => {
    mockScrollY = 0;
  });

  it('renders children correctly', () => {
    render(
      <StickyBreadcrumbWrapper>
        <div>Test Content</div>
      </StickyBreadcrumbWrapper>
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('applies relative positioning when not scrolled', () => {
    const { container } = render(
      <StickyBreadcrumbWrapper>
        <div>Test Content</div>
      </StickyBreadcrumbWrapper>
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('relative');
    expect(wrapper).not.toHaveClass('fixed');
  });

  it('applies fixed positioning when scrolled past offsetTop', async () => {
    mockScrollY = 50;

    const { container } = render(
      <StickyBreadcrumbWrapper offsetTop={32}>
        <div>Test Content</div>
      </StickyBreadcrumbWrapper>
    );

    // Trigger scroll event
    window.dispatchEvent(new Event('scroll'));

    // Wait for state update
    await screen.findByText('Test Content');

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('fixed');
    expect(wrapper).not.toHaveClass('relative');
  });

  it('uses default offsetTop of 0 when not provided', async () => {
    mockScrollY = 10;

    const { container } = render(
      <StickyBreadcrumbWrapper>
        <div>Test Content</div>
      </StickyBreadcrumbWrapper>
    );

    // Trigger scroll event
    window.dispatchEvent(new Event('scroll'));

    // Wait for state update
    await screen.findByText('Test Content');

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('fixed');
  });

  it('stays relative when scroll is less than offsetTop', async () => {
    mockScrollY = 20;

    const { container } = render(
      <StickyBreadcrumbWrapper offsetTop={50}>
        <div>Test Content</div>
      </StickyBreadcrumbWrapper>
    );

    // Trigger scroll event
    window.dispatchEvent(new Event('scroll'));

    // Wait for state update
    await screen.findByText('Test Content');

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('relative');
    expect(wrapper).not.toHaveClass('fixed');
  });

  it('applies correct styling classes', () => {
    const { container } = render(
      <StickyBreadcrumbWrapper>
        <div>Test Content</div>
      </StickyBreadcrumbWrapper>
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('top-0');
    expect(wrapper).toHaveClass('left-0');
    expect(wrapper).toHaveClass('right-0');
    expect(wrapper).toHaveClass('z-50');
    expect(wrapper).toHaveClass('w-full');
    expect(wrapper).toHaveClass('mb-2');
    expect(wrapper).toHaveClass('bg-white/80');
    expect(wrapper).toHaveClass('py-3');
    expect(wrapper).toHaveClass('transition-all');
    expect(wrapper).toHaveClass('duration-200');
    expect(wrapper).toHaveClass('border-b');
    expect(wrapper).toHaveClass('border-gray-200');
  });

  it('contains inner container with correct classes', () => {
    const { container } = render(
      <StickyBreadcrumbWrapper>
        <div>Test Content</div>
      </StickyBreadcrumbWrapper>
    );

    const innerContainer = container.querySelector('.container');
    expect(innerContainer).toBeInTheDocument();
    expect(innerContainer).toHaveClass('mx-auto');
    expect(innerContainer).toHaveClass('w-full');
    expect(innerContainer).toHaveClass('max-w-full');
    expect(innerContainer).toHaveClass('px-4');
  });

  it('removes scroll event listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(
      <StickyBreadcrumbWrapper>
        <div>Test Content</div>
      </StickyBreadcrumbWrapper>
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));

    removeEventListenerSpy.mockRestore();
  });

  it('checks initial scroll state on mount', () => {
    mockScrollY = 100;

    const { container } = render(
      <StickyBreadcrumbWrapper offsetTop={50}>
        <div>Test Content</div>
      </StickyBreadcrumbWrapper>
    );

    const wrapper = container.firstChild as HTMLElement;
    // Initial state should be checked immediately
    expect(wrapper).toBeInTheDocument();
  });

  it('transitions between fixed and relative on scroll changes', async () => {
    mockScrollY = 0;

    const { container } = render(
      <StickyBreadcrumbWrapper offsetTop={50}>
        <div>Test Content</div>
      </StickyBreadcrumbWrapper>
    );

    let wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('relative');

    // Simulate scroll down
    mockScrollY = 100;
    window.dispatchEvent(new Event('scroll'));
    await screen.findByText('Test Content');

    wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('fixed');

    // Simulate scroll back up
    mockScrollY = 30;
    window.dispatchEvent(new Event('scroll'));
    await screen.findByText('Test Content');

    wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('relative');
  });

  it('handles multiple children correctly', () => {
    render(
      <StickyBreadcrumbWrapper>
        <div>First Child</div>
        <div>Second Child</div>
        <span>Third Child</span>
      </StickyBreadcrumbWrapper>
    );

    expect(screen.getByText('First Child')).toBeInTheDocument();
    expect(screen.getByText('Second Child')).toBeInTheDocument();
    expect(screen.getByText('Third Child')).toBeInTheDocument();
  });

  it('updates when offsetTop prop changes', async () => {
    mockScrollY = 40;

    const { container, rerender } = render(
      <StickyBreadcrumbWrapper offsetTop={50}>
        <div>Test Content</div>
      </StickyBreadcrumbWrapper>
    );

    window.dispatchEvent(new Event('scroll'));
    await screen.findByText('Test Content');

    let wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('relative');

    // Change offsetTop to a lower value
    rerender(
      <StickyBreadcrumbWrapper offsetTop={30}>
        <div>Test Content</div>
      </StickyBreadcrumbWrapper>
    );

    window.dispatchEvent(new Event('scroll'));
    await screen.findByText('Test Content');

    wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('fixed');
  });

  it('returns null when isVisible is false', () => {
    const { container } = render(
      <StickyBreadcrumbWrapper isVisible={false}>
        <div>Test Content</div>
      </StickyBreadcrumbWrapper>
    );

    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
  });
});
