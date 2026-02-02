import { render, screen } from '@testing-library/react';

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from './pagination';

describe('Pagination', () => {
  it('renders', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('has pagination aria-label', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByRole('navigation')).toHaveAttribute('aria-label', 'pagination');
  });

  it('renders with data-slot attribute', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(document.querySelector('[data-slot="pagination"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Pagination className="custom-pagination">
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByRole('navigation')).toHaveClass('custom-pagination');
  });
});

describe('PaginationContent', () => {
  it('renders', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByRole('list')).toBeInTheDocument();
  });

  it('renders with data-slot attribute', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(document.querySelector('[data-slot="pagination-content"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Pagination>
        <PaginationContent className="custom-content">
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByRole('list')).toHaveClass('custom-content');
  });
});

describe('PaginationItem', () => {
  it('renders', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByRole('listitem')).toBeInTheDocument();
  });

  it('renders with data-slot attribute', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(document.querySelector('[data-slot="pagination-item"]')).toBeInTheDocument();
  });
});

describe('PaginationLink', () => {
  it('renders', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByRole('link')).toBeInTheDocument();
  });

  it('renders with data-slot attribute', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(document.querySelector('[data-slot="pagination-link"]')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">Page 1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByText('Page 1')).toBeInTheDocument();
  });

  it('has aria-current when active', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#" isActive>
              1
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByRole('link')).toHaveAttribute('aria-current', 'page');
  });

  it('has data-active attribute when active', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#" isActive>
              1
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByRole('link')).toHaveAttribute('data-active', 'true');
  });

  it('does not have aria-current when inactive', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByRole('link')).not.toHaveAttribute('aria-current');
  });

  it('applies custom className', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink href="#" className="custom-link">
              1
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByRole('link')).toHaveClass('custom-link');
  });
});

describe('PaginationPrevious', () => {
  it('renders', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByLabelText('Go to previous page')).toBeInTheDocument();
  });

  it('contains Previous text', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByText('Previous')).toBeInTheDocument();
  });

  it('contains chevron left icon', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" className="custom-prev" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByLabelText('Go to previous page')).toHaveClass('custom-prev');
  });
});

describe('PaginationNext', () => {
  it('renders', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByLabelText('Go to next page')).toBeInTheDocument();
  });

  it('contains Next text', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('contains chevron right icon', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationNext href="#" className="custom-next" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByLabelText('Go to next page')).toHaveClass('custom-next');
  });
});

describe('PaginationEllipsis', () => {
  it('renders', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(document.querySelector('[data-slot="pagination-ellipsis"]')).toBeInTheDocument();
  });

  it('is hidden from accessibility tree', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(document.querySelector('[data-slot="pagination-ellipsis"]')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('contains screen reader text', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByText('More pages')).toBeInTheDocument();
  });

  it('screen reader text has sr-only class', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByText('More pages')).toHaveClass('sr-only');
  });

  it('contains more horizontal icon', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationEllipsis className="custom-ellipsis" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(document.querySelector('[data-slot="pagination-ellipsis"]')).toHaveClass(
      'custom-ellipsis'
    );
  });
});

describe('Full Pagination Integration', () => {
  it('renders a complete pagination', () => {
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#" isActive>
              2
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#">3</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to previous page')).toBeInTheDocument();
    expect(screen.getByLabelText('Go to next page')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('More pages')).toBeInTheDocument();
  });
});
