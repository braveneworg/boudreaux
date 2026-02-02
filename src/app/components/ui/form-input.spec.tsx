import { render, screen } from '@testing-library/react';

import FormInput from './form-input';

describe('FormInput', () => {
  const defaultProps = {
    id: 'test-input',
    placeholder: 'Enter value',
    type: 'text',
    value: '',
  };

  it('renders', () => {
    render(<FormInput {...defaultProps} />);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('has correct id', () => {
    render(<FormInput {...defaultProps} />);

    expect(screen.getByRole('textbox')).toHaveAttribute('id', 'test-input');
  });

  it('has correct placeholder', () => {
    render(<FormInput {...defaultProps} />);

    expect(screen.getByPlaceholderText('Enter value')).toBeInTheDocument();
  });

  it('has correct type', () => {
    render(<FormInput {...defaultProps} type="email" />);

    expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email');
  });

  it('renders with password type', () => {
    render(<FormInput {...defaultProps} type="password" />);

    // Password inputs don't have a textbox role
    expect(document.getElementById('test-input')).toHaveAttribute('type', 'password');
  });

  it('can have autoFocus', () => {
    render(<FormInput {...defaultProps} autoFocus />);

    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('has height class h-12', () => {
    render(<FormInput {...defaultProps} />);

    expect(screen.getByRole('textbox')).toHaveClass('h-12');
  });

  it('has text size class text-lg', () => {
    render(<FormInput {...defaultProps} />);

    expect(screen.getByRole('textbox')).toHaveClass('text-lg');
  });
});
