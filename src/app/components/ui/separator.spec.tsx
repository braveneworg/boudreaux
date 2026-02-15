/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { Separator } from './separator';

// Helper to get separator - decorative separators have role="none"
const getSeparator = (testId = 'test-separator') => screen.getByTestId(testId);

describe('Separator', () => {
  describe('rendering', () => {
    it('should render with default props', () => {
      render(<Separator data-testid="test-separator" />);
      const separator = getSeparator();
      expect(separator).toBeInTheDocument();
    });

    it('should have horizontal orientation by default', () => {
      render(<Separator data-testid="test-separator" />);
      const separator = getSeparator();
      expect(separator).toHaveAttribute('data-orientation', 'horizontal');
    });

    it('should be decorative by default (role=none)', () => {
      render(<Separator data-testid="test-separator" />);
      const separator = getSeparator();
      // Decorative separators have role="none" per Radix
      expect(separator).toHaveAttribute('role', 'none');
    });

    it('should have data-slot attribute', () => {
      render(<Separator data-testid="test-separator" />);
      const separator = getSeparator();
      expect(separator).toHaveAttribute('data-slot', 'separator');
    });
  });

  describe('orientation', () => {
    it('should render with horizontal orientation', () => {
      render(<Separator data-testid="test-separator" orientation="horizontal" />);
      const separator = getSeparator();
      expect(separator).toHaveAttribute('data-orientation', 'horizontal');
    });

    it('should render with vertical orientation', () => {
      render(<Separator data-testid="test-separator" orientation="vertical" />);
      const separator = getSeparator();
      expect(separator).toHaveAttribute('data-orientation', 'vertical');
    });
  });

  describe('decorative prop', () => {
    it('should have role=none when decorative is true', () => {
      render(<Separator data-testid="test-separator" decorative />);
      const separator = getSeparator();
      expect(separator).toHaveAttribute('role', 'none');
    });

    it('should have role=separator when decorative is false', () => {
      render(<Separator data-testid="test-separator" decorative={false} />);
      const separator = getSeparator();
      expect(separator).toHaveAttribute('role', 'separator');
    });
  });

  describe('className prop', () => {
    it('should apply custom className', () => {
      render(<Separator data-testid="test-separator" className="custom-class" />);
      const separator = getSeparator();
      expect(separator).toHaveClass('custom-class');
    });

    it('should merge custom className with default classes', () => {
      render(<Separator data-testid="test-separator" className="custom-class" />);
      const separator = getSeparator();
      expect(separator).toHaveClass('bg-border');
      expect(separator).toHaveClass('shrink-0');
      expect(separator).toHaveClass('custom-class');
    });
  });

  describe('additional props', () => {
    it('should pass through additional props', () => {
      render(<Separator data-testid="test-separator" />);
      expect(screen.getByTestId('test-separator')).toBeInTheDocument();
    });

    it('should pass through style prop', () => {
      render(<Separator data-testid="test-separator" style={{ margin: '10px' }} />);
      const separator = getSeparator();
      expect(separator).toHaveStyle({ margin: '10px' });
    });
  });
});
