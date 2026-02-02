import { render, screen } from '@testing-library/react';

import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './resizable';

describe('ResizablePanelGroup', () => {
  it('renders', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>Panel 1</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    );

    expect(document.querySelector('[data-slot="resizable-panel-group"]')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>Panel content</ResizablePanel>
      </ResizablePanelGroup>
    );

    expect(screen.getByText('Panel content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <ResizablePanelGroup direction="horizontal" className="custom-group">
        <ResizablePanel>Panel 1</ResizablePanel>
      </ResizablePanelGroup>
    );

    expect(document.querySelector('[data-slot="resizable-panel-group"]')).toHaveClass(
      'custom-group'
    );
  });

  it('has flex layout classes', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>Panel 1</ResizablePanel>
      </ResizablePanelGroup>
    );

    expect(document.querySelector('[data-slot="resizable-panel-group"]')).toHaveClass(
      'flex',
      'h-full',
      'w-full'
    );
  });

  it('renders with horizontal direction', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>Panel 1</ResizablePanel>
      </ResizablePanelGroup>
    );

    const group = document.querySelector('[data-slot="resizable-panel-group"]');
    expect(group).toHaveAttribute('data-panel-group-direction', 'horizontal');
  });

  it('renders with vertical direction', () => {
    render(
      <ResizablePanelGroup direction="vertical">
        <ResizablePanel>Panel 1</ResizablePanel>
      </ResizablePanelGroup>
    );

    const group = document.querySelector('[data-slot="resizable-panel-group"]');
    expect(group).toHaveAttribute('data-panel-group-direction', 'vertical');
  });
});

describe('ResizablePanel', () => {
  it('renders', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>Panel</ResizablePanel>
      </ResizablePanelGroup>
    );

    expect(document.querySelector('[data-slot="resizable-panel"]')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>Panel content here</ResizablePanel>
      </ResizablePanelGroup>
    );

    expect(screen.getByText('Panel content here')).toBeInTheDocument();
  });

  it('renders with default size', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={50}>Panel</ResizablePanel>
      </ResizablePanelGroup>
    );

    expect(document.querySelector('[data-slot="resizable-panel"]')).toBeInTheDocument();
  });
});

describe('ResizableHandle', () => {
  it('renders', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>Panel 1</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    );

    expect(document.querySelector('[data-slot="resizable-handle"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>Panel 1</ResizablePanel>
        <ResizableHandle className="custom-handle" />
        <ResizablePanel>Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    );

    expect(document.querySelector('[data-slot="resizable-handle"]')).toHaveClass('custom-handle');
  });

  it('renders without grip handle by default', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>Panel 1</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    );

    expect(document.querySelector('svg')).not.toBeInTheDocument();
  });

  it('renders with grip handle when withHandle is true', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>Panel 1</ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel>Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    );

    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('renders grip handle with proper styling', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>Panel 1</ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel>Panel 2</ResizablePanel>
      </ResizablePanelGroup>
    );

    const handleContainer = document
      .querySelector('[data-slot="resizable-handle"]')
      ?.querySelector('div');
    expect(handleContainer).toHaveClass('z-10', 'flex', 'rounded-xs');
  });
});

describe('Resizable Integration', () => {
  it('renders multiple panels with handles', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={25}>Left Panel</ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50}>Middle Panel</ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={25}>Right Panel</ResizablePanel>
      </ResizablePanelGroup>
    );

    expect(screen.getByText('Left Panel')).toBeInTheDocument();
    expect(screen.getByText('Middle Panel')).toBeInTheDocument();
    expect(screen.getByText('Right Panel')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="resizable-panel"]')).toHaveLength(3);
    expect(document.querySelectorAll('[data-slot="resizable-handle"]')).toHaveLength(2);
  });
});
