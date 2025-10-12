import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import React from 'react'

import { Label } from './label'

describe('Label', () => {
  describe('rendering', () => {
    it('should render a label element', () => {
      render(<Label>Test Label</Label>)

      const label = screen.getByText('Test Label')
      expect(label).toBeInTheDocument()
      expect(label).toHaveAttribute('data-slot', 'label')
    })

    it('should render children correctly', () => {
      render(<Label>Username</Label>)

      expect(screen.getByText('Username')).toBeInTheDocument()
    })

    it('should render complex children', () => {
      render(
        <Label>
          <span>Required</span>
          <span className="text-red-500">*</span>
        </Label>
      )

      expect(screen.getByText('Required')).toBeInTheDocument()
      expect(screen.getByText('*')).toBeInTheDocument()
    })
  })

  describe('styling', () => {
    it('should apply default CSS classes', () => {
      render(<Label>Default Label</Label>)

      const label = screen.getByText('Default Label')
      expect(label).toHaveClass(
        'flex',
        'items-center',
        'gap-2',
        'text-sm',
        'leading-none',
        'font-medium',
        'select-none'
      )
    })

    it('should apply custom className along with default classes', () => {
      render(<Label className="custom-class">Custom Label</Label>)

      const label = screen.getByText('Custom Label')
      expect(label).toHaveClass('custom-class')
      expect(label).toHaveClass('flex', 'items-center') // default classes should still be present
    })

    it('should have disabled state styles in classes', () => {
      render(<Label>Disabled Label</Label>)

      const label = screen.getByText('Disabled Label')
      expect(label).toHaveClass(
        'group-data-[disabled=true]:pointer-events-none',
        'group-data-[disabled=true]:opacity-50',
        'peer-disabled:cursor-not-allowed',
        'peer-disabled:opacity-50'
      )
    })
  })

  describe('interactions', () => {
    it('should call onClick handler when clicked', async () => {
      const handleClick = vi.fn()
      const user = userEvent.setup()

      render(<Label onClick={handleClick}>Clickable Label</Label>)

      await user.click(screen.getByText('Clickable Label'))
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('should focus associated input when clicked', async () => {
      const user = userEvent.setup()

      render(
        <div>
          <Label htmlFor="test-input">Test Label</Label>
          <input id="test-input" type="text" />
        </div>
      )

      const input = screen.getByRole('textbox')
      await user.click(screen.getByText('Test Label'))

      expect(input).toHaveFocus()
    })

    it('should work with nested inputs', async () => {
      const user = userEvent.setup()

      render(
        <Label>
          Username
          <input type="text" />
        </Label>
      )

      const input = screen.getByRole('textbox')
      await user.click(screen.getByText('Username'))

      expect(input).toHaveFocus()
    })
  })

  describe('accessibility', () => {
    it('should associate with input using htmlFor', () => {
      render(
        <div>
          <Label htmlFor="username">Username</Label>
          <input id="username" type="text" />
        </div>
      )

      const label = screen.getByText('Username')
      const input = screen.getByRole('textbox')

      expect(label).toHaveAttribute('for', 'username')
      expect(input).toHaveAttribute('id', 'username')
    })

    it('should work with implicit association (nested input)', () => {
      render(
        <Label>
          Email
          <input type="email" />
        </Label>
      )

      const input = screen.getByRole('textbox')
      expect(screen.getByLabelText('Email')).toBe(input)
    })

    it('should support aria-label', () => {
      render(<Label aria-label="Form field label">Field Label</Label>)

      const label = screen.getByLabelText('Form field label')
      expect(label).toBeInTheDocument()
    })

    it('should support aria-describedby', () => {
      render(
        <div>
          <Label aria-describedby="help-text">Label with help</Label>
          <div id="help-text">This is help text</div>
        </div>
      )

      const label = screen.getByText('Label with help')
      expect(label).toHaveAttribute('aria-describedby', 'help-text')
    })
  })

  describe('HTML attributes', () => {
    it('should pass through HTML attributes', () => {
      render(
        <Label
          htmlFor="test-field"
          title="Label tooltip"
          data-testid="custom-label"
        >
          Test Label
        </Label>
      )

      const label = screen.getByTestId('custom-label')
      expect(label).toHaveAttribute('for', 'test-field')
      expect(label).toHaveAttribute('title', 'Label tooltip')
    })

    it('should support custom data attributes', () => {
      render(
        <Label data-custom="value" data-another="test">
          Custom Data
        </Label>
      )

      const label = screen.getByText('Custom Data')
      expect(label).toHaveAttribute('data-custom', 'value')
      expect(label).toHaveAttribute('data-another', 'test')
    })
  })

  describe('form integration', () => {
    it('should work with checkbox inputs', async () => {
      const user = userEvent.setup()

      render(
        <Label htmlFor="agree">
          <input id="agree" type="checkbox" />
          I agree to the terms
        </Label>
      )

      const checkbox = screen.getByRole('checkbox')
      await user.click(screen.getByText('I agree to the terms'))

      expect(checkbox).toBeChecked()
    })

    it('should work with radio inputs', async () => {
      const user = userEvent.setup()

      render(
        <div>
          <Label htmlFor="option1">
            <input id="option1" name="choice" type="radio" value="1" />
            Option 1
          </Label>
          <Label htmlFor="option2">
            <input id="option2" name="choice" type="radio" value="2" />
            Option 2
          </Label>
        </div>
      )

      const radio1 = screen.getByRole('radio', { name: 'Option 1' })
      await user.click(screen.getByText('Option 1'))

      expect(radio1).toBeChecked()
    })

    it('should work with select elements', () => {
      render(
        <div>
          <Label htmlFor="country">Country</Label>
          <select id="country">
            <option value="us">United States</option>
            <option value="ca">Canada</option>
          </select>
        </div>
      )

      const select = screen.getByRole('combobox')
      expect(screen.getByLabelText('Country')).toBe(select)
    })

    it('should work with textarea elements', () => {
      render(
        <div>
          <Label htmlFor="message">Message</Label>
          <textarea id="message" />
        </div>
      )

      const textarea = screen.getByRole('textbox')
      expect(screen.getByLabelText('Message')).toBe(textarea)
    })
  })

  describe('required field indicators', () => {
    it('should render required indicator', () => {
      render(
        <Label>
          Email
          <span className="text-red-500">*</span>
        </Label>
      )

      expect(screen.getByText('Email')).toBeInTheDocument()
      expect(screen.getByText('*')).toBeInTheDocument()
    })

    it('should handle complex required indicators', () => {
      render(
        <Label>
          <span>Full Name</span>
          <span className="text-red-500 ml-1" aria-label="required">*</span>
        </Label>
      )

      expect(screen.getByText('Full Name')).toBeInTheDocument()
      expect(screen.getByLabelText('required')).toBeInTheDocument()
    })
  })

  describe('disabled states', () => {
    it('should handle disabled state through group context', () => {
      render(
        <div data-disabled="true" className="group">
          <Label>Disabled Label</Label>
        </div>
      )

      const label = screen.getByText('Disabled Label')
      // The disabled styles are applied via CSS classes, not DOM attributes
      expect(label).toHaveClass('group-data-[disabled=true]:pointer-events-none')
    })

    it('should handle peer disabled states', () => {
      render(
        <div>
          <input type="text" disabled className="peer" />
          <Label>Peer Disabled Label</Label>
        </div>
      )

      const label = screen.getByText('Peer Disabled Label')
      expect(label).toHaveClass('peer-disabled:cursor-not-allowed')
    })
  })
})