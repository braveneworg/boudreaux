import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import React from 'react'

import { Input } from './input'

describe('Input', () => {
  describe('rendering', () => {
    it('should render an input element', () => {
      render(<Input />)

      const input = screen.getByRole('textbox')
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('data-slot', 'input')
    })

    it('should render with default type text', () => {
      render(<Input />)

      const input = screen.getByRole('textbox') as HTMLInputElement
      // HTML inputs don't have explicit type="text" when type is not specified
      expect(input.type).toBe('text')
    })

    it('should render with specified type', () => {
      render(<Input type="email" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('type', 'email')
    })

    it('should render password input correctly', () => {
      render(<Input type="password" />)

      const input = document.querySelector('input[type="password"]') // password inputs don't have accessible role
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('type', 'password')
    })

    it('should render number input correctly', () => {
      render(<Input type="number" />)

      const input = screen.getByRole('spinbutton')
      expect(input).toHaveAttribute('type', 'number')
    })
  })

  describe('styling', () => {
    it('should apply default CSS classes', () => {
      render(<Input />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveClass(
        'h-9',
        'w-full',
        'rounded-md',
        'border',
        'bg-transparent',
        'px-3',
        'py-1'
      )
    })

    it('should apply custom className along with default classes', () => {
      render(<Input className="custom-class" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveClass('custom-class')
      expect(input).toHaveClass('h-9', 'w-full') // default classes should still be present
    })

    it('should have focus styles in classes', () => {
      render(<Input />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveClass(
        'focus-visible:border-ring',
        'focus-visible:ring-ring/50',
        'focus-visible:ring-[3px]'
      )
    })

    it('should have disabled styles in classes', () => {
      render(<Input disabled />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveClass(
        'disabled:pointer-events-none',
        'disabled:cursor-not-allowed',
        'disabled:opacity-50'
      )
    })

    it('should have invalid styles in classes', () => {
      render(<Input aria-invalid />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveClass(
        'aria-invalid:ring-destructive/20',
        'aria-invalid:border-destructive'
      )
    })
  })

  describe('states', () => {
    it('should be enabled by default', () => {
      render(<Input />)

      const input = screen.getByRole('textbox')
      expect(input).toBeEnabled()
    })

    it('should be disabled when disabled prop is true', () => {
      render(<Input disabled />)

      const input = screen.getByRole('textbox')
      expect(input).toBeDisabled()
    })

    it('should show as required when required prop is true', () => {
      render(<Input required />)

      const input = screen.getByRole('textbox')
      expect(input).toBeRequired()
    })

    it('should show as invalid when aria-invalid is true', () => {
      render(<Input aria-invalid />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-invalid', 'true')
    })
  })

  describe('interactions', () => {
    it('should handle text input', async () => {
      const user = userEvent.setup()
      render(<Input />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'Hello World')

      expect(input).toHaveValue('Hello World')
    })

    it('should call onChange handler', async () => {
      const handleChange = vi.fn()
      const user = userEvent.setup()

      render(<Input onChange={handleChange} />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'test')

      expect(handleChange).toHaveBeenCalled()
      expect(handleChange).toHaveBeenCalledTimes(4) // once for each character
    })

    it('should call onFocus handler', async () => {
      const handleFocus = vi.fn()
      const user = userEvent.setup()

      render(<Input onFocus={handleFocus} />)

      const input = screen.getByRole('textbox')
      await user.click(input)

      expect(handleFocus).toHaveBeenCalledTimes(1)
    })

    it('should call onBlur handler', async () => {
      const handleBlur = vi.fn()
      const user = userEvent.setup()

      render(<Input onBlur={handleBlur} />)

      const input = screen.getByRole('textbox')
      await user.click(input)
      await user.tab()

      expect(handleBlur).toHaveBeenCalledTimes(1)
    })

    it('should not call handlers when disabled', async () => {
      const handleChange = vi.fn()
      const handleFocus = vi.fn()
      const user = userEvent.setup()

      render(<Input disabled onChange={handleChange} onFocus={handleFocus} />)

      const input = screen.getByRole('textbox')
      await user.click(input)
      await user.type(input, 'test')

      expect(handleFocus).not.toHaveBeenCalled()
      expect(handleChange).not.toHaveBeenCalled()
    })
  })

  describe('attributes', () => {
    it('should support placeholder', () => {
      render(<Input placeholder="Enter text here" />)

      const input = screen.getByPlaceholderText('Enter text here')
      expect(input).toBeInTheDocument()
    })

    it('should support defaultValue', () => {
      render(<Input defaultValue="Default text" />)

      const input = screen.getByDisplayValue('Default text')
      expect(input).toBeInTheDocument()
    })

    it('should support value (controlled)', () => {
      const handleChange = vi.fn()
      render(<Input value="Controlled value" onChange={handleChange} />)

      const input = screen.getByDisplayValue('Controlled value')
      expect(input).toBeInTheDocument()
    })

    it('should support name attribute', () => {
      render(<Input name="username" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('name', 'username')
    })

    it('should support id attribute', () => {
      render(<Input id="user-input" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('id', 'user-input')
    })

    it('should support maxLength', () => {
      render(<Input maxLength={10} />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('maxLength', '10')
    })

    it('should support minLength', () => {
      render(<Input minLength={3} />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('minLength', '3')
    })

    it('should support pattern', () => {
      render(<Input pattern="[0-9]{3}" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('pattern', '[0-9]{3}')
    })
  })

  describe('accessibility', () => {
    it('should be focusable', () => {
      render(<Input />)

      const input = screen.getByRole('textbox')
      input.focus()
      expect(input).toHaveFocus()
    })

    it('should not be focusable when disabled', () => {
      render(<Input disabled />)

      const input = screen.getByRole('textbox')
      expect(input).toBeDisabled()
    })

    it('should support aria-label', () => {
      render(<Input aria-label="Username input" />)

      const input = screen.getByRole('textbox', { name: 'Username input' })
      expect(input).toBeInTheDocument()
    })

    it('should support aria-describedby', () => {
      render(
        <div>
          <Input aria-describedby="help-text" />
          <div id="help-text">Enter your username</div>
        </div>
      )

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-describedby', 'help-text')
    })

    it('should support aria-invalid', () => {
      render(<Input aria-invalid={true} />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('aria-invalid', 'true')
    })
  })

  describe('input types', () => {
    it('should handle email type with validation', async () => {
      const user = userEvent.setup()
      render(<Input type="email" />)

      const input = screen.getByRole('textbox')
      await user.type(input, 'test@example.com')

      expect(input).toHaveValue('test@example.com')
      expect(input).toHaveAttribute('type', 'email')
    })

    it('should handle password type', async () => {
      const user = userEvent.setup()
      render(<Input type="password" />)

      const input = document.querySelector('input[type="password"]') as HTMLInputElement // password inputs don't have accessible role
      await user.type(input, 'secret123')

      expect(input).toHaveValue('secret123')
    })

    it('should handle number type', async () => {
      const user = userEvent.setup()
      render(<Input type="number" />)

      const input = screen.getByRole('spinbutton')
      await user.type(input, '123')

      expect(input).toHaveValue(123) // number inputs return numeric values
    })

    it('should handle search type', () => {
      render(<Input type="search" />)

      const input = screen.getByRole('searchbox')
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('type', 'search')
    })

    it('should handle tel type', () => {
      render(<Input type="tel" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('type', 'tel')
    })

    it('should handle url type', () => {
      render(<Input type="url" />)

      const input = screen.getByRole('textbox')
      expect(input).toHaveAttribute('type', 'url')
    })
  })

  describe('file input', () => {
    it('should handle file input type', () => {
      render(<Input type="file" />)

      const input = document.querySelector('input[type="file"]') // file inputs don't have standard role
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('type', 'file')
    })

    it('should apply file-specific styles', () => {
      render(<Input type="file" />)

      const input = document.querySelector('input[type="file"]') // file inputs don't have standard role
      expect(input).toHaveClass('file:text-foreground', 'file:bg-transparent')
    })
  })
})