import React from 'react';

import { render, screen } from '@testing-library/react';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './select';

describe('Select Components', () => {
  describe('Select', () => {
    it('renders children', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
        </Select>
      );

      expect(screen.getByTestId('trigger')).toBeInTheDocument();
    });
  });

  describe('SelectTrigger', () => {
    it('renders with data-slot attribute', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue />
          </SelectTrigger>
        </Select>
      );

      expect(screen.getByTestId('trigger')).toHaveAttribute('data-slot', 'select-trigger');
    });

    it('renders with default size', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger">
            <SelectValue />
          </SelectTrigger>
        </Select>
      );

      expect(screen.getByTestId('trigger')).toHaveAttribute('data-size', 'default');
    });

    it('renders with sm size', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger" size="sm">
            <SelectValue />
          </SelectTrigger>
        </Select>
      );

      expect(screen.getByTestId('trigger')).toHaveAttribute('data-size', 'sm');
    });

    it('applies custom className', () => {
      render(
        <Select>
          <SelectTrigger data-testid="trigger" className="custom-trigger">
            <SelectValue />
          </SelectTrigger>
        </Select>
      );

      expect(screen.getByTestId('trigger')).toHaveClass('custom-trigger');
    });

    it('renders children', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
        </Select>
      );

      expect(screen.getByText('Select an option')).toBeInTheDocument();
    });
  });

  describe('SelectValue', () => {
    it('renders with data-slot attribute', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue data-testid="value" placeholder="Select an option" />
          </SelectTrigger>
        </Select>
      );

      expect(screen.getByTestId('value')).toHaveAttribute('data-slot', 'select-value');
    });

    it('shows placeholder text', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
        </Select>
      );

      expect(screen.getByText('Select an option')).toBeInTheDocument();
    });
  });

  describe('SelectContent', () => {
    it('renders with data-slot attribute when open', () => {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent data-testid="content">
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByTestId('content')).toHaveAttribute('data-slot', 'select-content');
    });

    it('applies custom className', () => {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent data-testid="content" className="custom-content">
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByTestId('content')).toHaveClass('custom-content');
    });
  });

  describe('SelectGroup', () => {
    it('renders with data-slot attribute', () => {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup data-testid="group">
              <SelectItem value="option1">Option 1</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      );

      expect(screen.getByTestId('group')).toHaveAttribute('data-slot', 'select-group');
    });
  });

  describe('SelectLabel', () => {
    it('renders with data-slot attribute', () => {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel data-testid="label">Category</SelectLabel>
              <SelectItem value="option1">Option 1</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      );

      expect(screen.getByTestId('label')).toHaveAttribute('data-slot', 'select-label');
    });

    it('applies custom className', () => {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel data-testid="label" className="custom-label">
                Category
              </SelectLabel>
              <SelectItem value="option1">Option 1</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      );

      expect(screen.getByTestId('label')).toHaveClass('custom-label');
    });

    it('renders children', () => {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Category Label</SelectLabel>
              <SelectItem value="option1">Option 1</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      );

      expect(screen.getByText('Category Label')).toBeInTheDocument();
    });
  });

  describe('SelectItem', () => {
    it('renders with data-slot attribute', () => {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem data-testid="item" value="option1">
              Option 1
            </SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByTestId('item')).toHaveAttribute('data-slot', 'select-item');
    });

    it('applies custom className', () => {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem data-testid="item" value="option1" className="custom-item">
              Option 1
            </SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByTestId('item')).toHaveClass('custom-item');
    });

    it('renders children', () => {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option Text</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByText('Option Text')).toBeInTheDocument();
    });

    it('renders as option role', () => {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByRole('option', { name: 'Option 1' })).toBeInTheDocument();
    });
  });

  describe('SelectSeparator', () => {
    it('renders with data-slot attribute', () => {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
            <SelectSeparator data-testid="separator" />
            <SelectItem value="option2">Option 2</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByTestId('separator')).toHaveAttribute('data-slot', 'select-separator');
    });

    it('applies custom className', () => {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
            <SelectSeparator data-testid="separator" className="custom-separator" />
            <SelectItem value="option2">Option 2</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByTestId('separator')).toHaveClass('custom-separator');
    });
  });

  describe('integration', () => {
    it('renders a complete select with groups', () => {
      render(
        <Select open>
          <SelectTrigger>
            <SelectValue placeholder="Select a fruit" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Fruits</SelectLabel>
              <SelectItem value="apple">Apple</SelectItem>
              <SelectItem value="banana">Banana</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Vegetables</SelectLabel>
              <SelectItem value="carrot">Carrot</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      );

      expect(screen.getByText('Fruits')).toBeInTheDocument();
      expect(screen.getByText('Vegetables')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Apple' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Carrot' })).toBeInTheDocument();
    });

    it('shows selected value', () => {
      render(
        <Select defaultValue="apple">
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectItem value="banana">Banana</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByRole('combobox')).toHaveTextContent('Apple');
    });
  });
});
