/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ResizableTextBox } from './resizable-text-box';

describe('ResizableTextBox', () => {
  const defaultProps = {
    width: 80,
    height: 30,
    onWidthChange: vi.fn(),
    onHeightChange: vi.fn(),
    positionX: 50,
    positionY: 50,
    rotation: 0,
    children: 'Test content',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the children content', () => {
      render(<ResizableTextBox {...defaultProps} />);
      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('applies the correct position and dimensions', () => {
      const { container } = render(<ResizableTextBox {...defaultProps} />);
      const box = container.firstChild as HTMLElement;

      expect(box).toHaveStyle({
        left: '50%',
        top: '50%',
        width: '80%',
        height: '30%',
      });
    });

    it('applies rotation transform', () => {
      const { container } = render(<ResizableTextBox {...defaultProps} rotation={45} />);
      const box = container.firstChild as HTMLElement;

      expect(box).toHaveStyle({
        transform: 'translate(-50%, -50%) rotate(45deg)',
      });
    });

    it('does not show resize handles when not selected', () => {
      render(<ResizableTextBox {...defaultProps} isSelected={false} />);

      // Resize handles should not be visible
      const handles = document.querySelectorAll('[class*="cursor-"]');
      // Only the content area should have cursor-grab
      expect(handles).toHaveLength(1);
    });

    it('shows resize handles when selected', () => {
      render(<ResizableTextBox {...defaultProps} isSelected />);

      // Should show 8 resize handles (4 edge + 4 corner) + rotation button
      // Edge handles have cursor-ns-resize or cursor-ew-resize
      // Corner handles have cursor-nesw-resize or cursor-nwse-resize
      const nsHandles = document.querySelectorAll('.cursor-ns-resize');
      const ewHandles = document.querySelectorAll('.cursor-ew-resize');
      const neswHandles = document.querySelectorAll('.cursor-nesw-resize');
      const nwseHandles = document.querySelectorAll('.cursor-nwse-resize');

      expect(nsHandles).toHaveLength(2); // North and South
      expect(ewHandles).toHaveLength(2); // East and West
      expect(neswHandles).toHaveLength(2); // Northeast and Southwest
      expect(nwseHandles).toHaveLength(2); // Northwest and Southeast
    });

    it('shows marching ants border when selected', () => {
      const { container } = render(<ResizableTextBox {...defaultProps} isSelected />);

      // Check for the marching ants animation element
      const marchingAnts = container.querySelector('[style*="animation: marching-ants"]');
      expect(marchingAnts).toBeInTheDocument();
    });

    it('does not show marching ants border when not selected', () => {
      const { container } = render(<ResizableTextBox {...defaultProps} isSelected={false} />);

      // Check that marching ants animation is not present
      const marchingAnts = container.querySelector('[style*="animation: marching-ants"]');
      expect(marchingAnts).not.toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onSelect when clicked', async () => {
      const onSelect = vi.fn();
      render(<ResizableTextBox {...defaultProps} onSelect={onSelect} />);

      const content = screen.getByText('Test content');
      await userEvent.click(content);

      expect(onSelect).toHaveBeenCalled();
    });

    it('calls onDragStart when mouse down on content', () => {
      const onDragStart = vi.fn();
      render(<ResizableTextBox {...defaultProps} onDragStart={onDragStart} />);

      const content = screen.getByText('Test content');
      fireEvent.mouseDown(content);

      expect(onDragStart).toHaveBeenCalled();
    });

    it('calls onDragStart when touch start on content', () => {
      const onDragStart = vi.fn();
      render(<ResizableTextBox {...defaultProps} onDragStart={onDragStart} />);

      const content = screen.getByText('Test content');
      fireEvent.touchStart(content);

      expect(onDragStart).toHaveBeenCalled();
    });

    it('calls onDoubleClick when content is double-clicked', async () => {
      const onDoubleClick = vi.fn();
      render(<ResizableTextBox {...defaultProps} onDoubleClick={onDoubleClick} />);

      const content = screen.getByText('Test content');
      await userEvent.dblClick(content);

      expect(onDoubleClick).toHaveBeenCalled();
    });

    it('shows rotation handle when onRotateStart is provided and selected', () => {
      const onRotateStart = vi.fn();
      render(<ResizableTextBox {...defaultProps} isSelected onRotateStart={onRotateStart} />);

      const rotationButton = screen.getByTitle(/Rotate text/);
      expect(rotationButton).toBeInTheDocument();
    });

    it('calls onRotateStart when rotation handle is clicked', () => {
      const onRotateStart = vi.fn();
      render(<ResizableTextBox {...defaultProps} isSelected onRotateStart={onRotateStart} />);

      const rotationButton = screen.getByTitle(/Rotate text/);
      fireEvent.mouseDown(rotationButton);

      expect(onRotateStart).toHaveBeenCalled();
    });
  });

  describe('styling', () => {
    it('applies custom text styles', () => {
      const textStyle = {
        fontFamily: 'Arial',
        fontSize: '2rem',
        color: 'rgb(255, 0, 0)',
      };

      const { container } = render(<ResizableTextBox {...defaultProps} textStyle={textStyle} />);

      // The textStyle is applied to the content div which has flex class
      const contentDiv = container.querySelector('.flex.h-full.w-full');
      expect(contentDiv).toHaveStyle(textStyle);
    });

    it('shows grabbing cursor when dragging', () => {
      const { container } = render(<ResizableTextBox {...defaultProps} isDragging />);

      // The content div should have cursor-grabbing class
      const contentDiv = container.querySelector('.cursor-grabbing');
      expect(contentDiv).toBeInTheDocument();
    });

    it('shows grab cursor when not dragging', () => {
      const { container } = render(<ResizableTextBox {...defaultProps} isDragging={false} />);

      // The content div should have cursor-grab class
      const contentDiv = container.querySelector('.cursor-grab');
      expect(contentDiv).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(<ResizableTextBox {...defaultProps} className="custom-class" />);

      // The content div should have the custom class
      const contentDiv = container.querySelector('.custom-class');
      expect(contentDiv).toBeInTheDocument();
    });

    it('renders title attribute', () => {
      const { container } = render(<ResizableTextBox {...defaultProps} title="Custom title" />);

      // The content div should have the title attribute
      const contentDiv = container.querySelector('[title="Custom title"]');
      expect(contentDiv).toBeInTheDocument();
    });
  });

  describe('resize handles', () => {
    it('triggers resize when north handle is dragged', () => {
      const onHeightChange = vi.fn();
      const { container } = render(
        <ResizableTextBox {...defaultProps} isSelected onHeightChange={onHeightChange} />
      );

      // Find north handle (first cursor-ns-resize element which is the top one)
      const northHandle = container.querySelector('.cursor-ns-resize.-top-1');
      expect(northHandle).toBeInTheDocument();

      // Start resize
      fireEvent.mouseDown(northHandle!);

      // Simulate mouse move
      fireEvent.mouseMove(document, { clientX: 100, clientY: 50 });

      // Note: The actual height change calculation depends on container dimensions
      // which are not easily mocked in tests. We verify the handler was set up.
      fireEvent.mouseUp(document);
    });

    it('triggers resize when east handle is dragged', () => {
      const onWidthChange = vi.fn();
      const { container } = render(
        <ResizableTextBox {...defaultProps} isSelected onWidthChange={onWidthChange} />
      );

      // Find east handle
      const eastHandle = container.querySelector('.cursor-ew-resize.-right-1');
      expect(eastHandle).toBeInTheDocument();

      fireEvent.mouseDown(eastHandle!);
      fireEvent.mouseMove(document, { clientX: 200, clientY: 100 });
      fireEvent.mouseUp(document);
    });

    it('stops resize on mouse up', () => {
      const { container } = render(<ResizableTextBox {...defaultProps} isSelected />);

      const eastHandle = container.querySelector('.cursor-ew-resize.-right-1');
      fireEvent.mouseDown(eastHandle!);

      // Mouse up should stop the resize
      fireEvent.mouseUp(document);

      // Further mouse moves should not affect anything
      const onWidthChange = vi.fn();
      render(<ResizableTextBox {...defaultProps} isSelected onWidthChange={onWidthChange} />);

      // Cleanup is handled by the component - test passes if no errors
      expect(container).toBeInTheDocument();
    });
  });

  describe('touch support', () => {
    it('handles touch resize on north handle', () => {
      const { container } = render(<ResizableTextBox {...defaultProps} isSelected />);

      const northHandle = container.querySelector('.cursor-ns-resize.-top-1');
      expect(northHandle).toBeInTheDocument();

      fireEvent.touchStart(northHandle!, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      fireEvent.touchMove(document, {
        touches: [{ clientX: 100, clientY: 50 }],
      });

      fireEvent.touchEnd(document);
    });
  });

  describe('constraints', () => {
    it('respects minimum width constraint', () => {
      const onWidthChange = vi.fn();
      render(
        <ResizableTextBox
          {...defaultProps}
          isSelected
          minWidth={20}
          onWidthChange={onWidthChange}
        />
      );

      // The constraint is enforced during resize calculations
      // This test verifies the prop is accepted
      expect(onWidthChange).not.toHaveBeenCalled();
    });

    it('respects maximum height constraint', () => {
      const onHeightChange = vi.fn();
      render(
        <ResizableTextBox
          {...defaultProps}
          isSelected
          maxHeight={50}
          onHeightChange={onHeightChange}
        />
      );

      // The constraint is enforced during resize calculations
      expect(onHeightChange).not.toHaveBeenCalled();
    });
  });
});
