import { render, screen } from '@testing-library/react';

import { Heading } from './heading';

describe('Heading', () => {
  it('renders', () => {
    render(<Heading>Heading</Heading>);

    expect(screen.getByRole('heading')).toBeInTheDocument();
  });

  it('defaults to h1', () => {
    render(<Heading>Default Heading</Heading>);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<Heading className="custom-heading">Heading</Heading>);

    expect(screen.getByRole('heading')).toHaveClass('custom-heading');
  });

  it('renders children', () => {
    render(<Heading>Heading text</Heading>);

    expect(screen.getByText('Heading text')).toBeInTheDocument();
  });

  describe('levels', () => {
    it('renders level 1', () => {
      render(<Heading level={1}>H1 Heading</Heading>);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading.tagName).toBe('H1');
    });

    it('renders level 2', () => {
      render(<Heading level={2}>H2 Heading</Heading>);

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toBeInTheDocument();
      expect(heading.tagName).toBe('H2');
    });

    it('renders level 3', () => {
      render(<Heading level={3}>H3 Heading</Heading>);

      const heading = screen.getByRole('heading', { level: 3 });
      expect(heading).toBeInTheDocument();
      expect(heading.tagName).toBe('H3');
    });

    it('renders level 4', () => {
      render(<Heading level={4}>H4 Heading</Heading>);

      const heading = screen.getByRole('heading', { level: 4 });
      expect(heading).toBeInTheDocument();
      expect(heading.tagName).toBe('H4');
    });

    it('renders level 5', () => {
      render(<Heading level={5}>H5 Heading</Heading>);

      const heading = screen.getByRole('heading', { level: 5 });
      expect(heading).toBeInTheDocument();
      expect(heading.tagName).toBe('H5');
    });

    it('renders level 6', () => {
      render(<Heading level={6}>H6 Heading</Heading>);

      const heading = screen.getByRole('heading', { level: 6 });
      expect(heading).toBeInTheDocument();
      expect(heading.tagName).toBe('H6');
    });

    it('falls back to h1 for invalid level', () => {
      // @ts-expect-error Testing invalid level
      render(<Heading level={7}>Invalid level</Heading>);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
      expect(heading.tagName).toBe('H1');
    });
  });

  it('passes additional props', () => {
    render(
      <Heading id="my-heading" aria-label="My heading">
        Heading
      </Heading>
    );

    const heading = screen.getByRole('heading');
    expect(heading).toHaveAttribute('id', 'my-heading');
    expect(heading).toHaveAttribute('aria-label', 'My heading');
  });

  it('supports ref forwarding', () => {
    const ref = { current: null };
    render(<Heading ref={ref}>Heading</Heading>);

    expect(ref.current).toBeInstanceOf(HTMLHeadingElement);
  });
});
