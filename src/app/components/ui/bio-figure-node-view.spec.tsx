/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReactNode } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BioFigureNodeView } from './bio-figure-node-view';

import type { NodeViewProps } from '@tiptap/react';

vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ children, ...props }: { children?: ReactNode }) => (
    <figure {...props}>{children}</figure>
  ),
}));

const makeProps = (overrides?: Partial<{ attrs: Record<string, unknown> }>): NodeViewProps =>
  ({
    node: {
      attrs: {
        src: 'https://cdn.example/x.webp',
        alt: 'x',
        width: 50,
        float: 'left',
        title: 'T',
        subtitle: null,
        attribution: 'A',
        ...overrides?.attrs,
      },
    },
    updateAttributes: vi.fn(),
    deleteNode: vi.fn(),
    selected: true,
  }) as unknown as NodeViewProps;

// jsdom has no layout: stub the wrapper's parent bounding rect to a fixed
// 100px-wide box so pointer deltas map 1px == 1% during resize math.
const stubParentRect = (): void => {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
};

// jsdom has no PointerEvent constructor, so fireEvent.pointer* would drop
// clientX/pointerId — back it with MouseEvent, which jsdom implements fully.
class MockPointerEvent extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

describe('BioFigureNodeView', () => {
  beforeAll(() => {
    globalThis.PointerEvent = MockPointerEvent as typeof PointerEvent;
    // jsdom lacks the pointer-capture API entirely — stub it.
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  });

  beforeEach(() => {
    stubParentRect();
  });

  it('renders the image and caption lines', () => {
    render(<BioFigureNodeView {...makeProps()} />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders the image with its alt text', () => {
    render(<BioFigureNodeView {...makeProps()} />);
    expect(screen.getByAltText('x')).toBeInTheDocument();
  });

  it('renders the subtitle line when set', () => {
    render(<BioFigureNodeView {...makeProps({ attrs: { subtitle: 'S' } })} />);
    expect(screen.getByText('S')).toBeInTheDocument();
  });

  it('omits the caption entirely when no caption fields are set', () => {
    const props = makeProps({ attrs: { title: null, subtitle: null, attribution: null } });
    const { container } = render(<BioFigureNodeView {...props} />);
    expect(container.querySelector('figcaption')).not.toBeInTheDocument();
  });

  it('keeps the caption at the fixed 11px floor', () => {
    const { container } = render(<BioFigureNodeView {...makeProps()} />);
    expect(container.querySelector('figcaption')).toHaveClass('text-[11px]');
  });

  it('applies the float class to the wrapper', () => {
    render(<BioFigureNodeView {...makeProps()} />);
    expect(screen.getByRole('figure')).toHaveClass('bio-figure--left');
  });

  it('sets the wrapper width from the width attribute', () => {
    render(<BioFigureNodeView {...makeProps()} />);
    expect(screen.getByRole('figure')).toHaveStyle({ width: '50%' });
  });

  it('deletes the node from the X overlay', async () => {
    const props = makeProps();
    render(<BioFigureNodeView {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    expect(props.deleteNode).toHaveBeenCalled();
  });

  it('updates float from the toggle group', async () => {
    const props = makeProps();
    render(<BioFigureNodeView {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Float right' }));
    expect(props.updateAttributes).toHaveBeenCalledWith({ float: 'right' });
  });

  it('centers the figure from the toggle group', async () => {
    const props = makeProps();
    render(<BioFigureNodeView {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Center image' }));
    expect(props.updateAttributes).toHaveBeenCalledWith({ float: 'none' });
  });

  it('marks the active float toggle as pressed', () => {
    render(<BioFigureNodeView {...makeProps()} />);
    expect(screen.getByRole('button', { name: 'Float left' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('marks inactive float toggles as unpressed', () => {
    render(<BioFigureNodeView {...makeProps()} />);
    expect(screen.getByRole('button', { name: 'Float right' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('exposes the current width on the resize handle', () => {
    render(<BioFigureNodeView {...makeProps()} />);
    expect(screen.getByRole('slider', { name: 'Resize image' })).toHaveAttribute(
      'aria-valuenow',
      '50'
    );
  });

  it('grows width with the keyboard on the resize handle', async () => {
    const props = makeProps();
    render(<BioFigureNodeView {...props} />);
    screen.getByRole('slider', { name: 'Resize image' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(props.updateAttributes).toHaveBeenCalledWith({ width: 55 });
  });

  it('shrinks width with the keyboard on the resize handle', async () => {
    const props = makeProps();
    render(<BioFigureNodeView {...props} />);
    screen.getByRole('slider', { name: 'Resize image' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(props.updateAttributes).toHaveBeenCalledWith({ width: 45 });
  });

  it('clamps keyboard resize to the 100 percent ceiling', async () => {
    const props = makeProps({ attrs: { width: 98 } });
    render(<BioFigureNodeView {...props} />);
    screen.getByRole('slider', { name: 'Resize image' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(props.updateAttributes).toHaveBeenCalledWith({ width: 100 });
  });

  it('jumps to the minimum width with the Home key', async () => {
    const props = makeProps();
    render(<BioFigureNodeView {...props} />);
    screen.getByRole('slider', { name: 'Resize image' }).focus();
    await userEvent.keyboard('{Home}');
    expect(props.updateAttributes).toHaveBeenCalledWith({ width: 20 });
  });

  it('jumps to the maximum width with the End key', async () => {
    const props = makeProps();
    render(<BioFigureNodeView {...props} />);
    screen.getByRole('slider', { name: 'Resize image' }).focus();
    await userEvent.keyboard('{End}');
    expect(props.updateAttributes).toHaveBeenCalledWith({ width: 100 });
  });

  it('ignores unrelated keys on the resize handle', async () => {
    const props = makeProps();
    render(<BioFigureNodeView {...props} />);
    screen.getByRole('slider', { name: 'Resize image' }).focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(props.updateAttributes).not.toHaveBeenCalled();
  });

  it('resizes with pointer drag against the parent width', () => {
    const props = makeProps();
    render(<BioFigureNodeView {...props} />);
    const handle = screen.getByRole('slider', { name: 'Resize image' });
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 110, pointerId: 1 });
    expect(props.updateAttributes).toHaveBeenLastCalledWith({ width: 60 });
  });

  it('clamps pointer resize to the 20 percent floor', () => {
    const props = makeProps({ attrs: { width: 22 } });
    render(<BioFigureNodeView {...props} />);
    const handle = screen.getByRole('slider', { name: 'Resize image' });
    fireEvent.pointerDown(handle, { clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 0, pointerId: 1 });
    expect(props.updateAttributes).toHaveBeenLastCalledWith({ width: 20 });
  });

  it('ignores pointer moves before a drag starts', () => {
    const props = makeProps();
    render(<BioFigureNodeView {...props} />);
    const handle = screen.getByRole('slider', { name: 'Resize image' });
    fireEvent.pointerMove(handle, { clientX: 300, pointerId: 1 });
    expect(props.updateAttributes).not.toHaveBeenCalled();
  });

  it('stops resizing after a cancelled pointer drag', () => {
    const props = makeProps();
    render(<BioFigureNodeView {...props} />);
    const handle = screen.getByRole('slider', { name: 'Resize image' });
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 300, pointerId: 1 });
    expect(props.updateAttributes).not.toHaveBeenCalled();
  });

  it('stops resizing after the pointer is released', () => {
    const props = makeProps();
    render(<BioFigureNodeView {...props} />);
    const handle = screen.getByRole('slider', { name: 'Resize image' });
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 300, pointerId: 1 });
    expect(props.updateAttributes).not.toHaveBeenCalled();
  });

  it('marks the image container as the ProseMirror drag handle', () => {
    const { container } = render(<BioFigureNodeView {...makeProps()} />);
    expect(container.querySelector('[data-drag-handle]')).toBeInTheDocument();
  });
});
