import { render, screen } from '@testing-library/react';

import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuRadioGroup,
} from './context-menu';

describe('ContextMenu', () => {
  it('can be imported', () => {
    expect(ContextMenu).toBeDefined();
    expect(typeof ContextMenu).toBe('function');
  });

  it('renders trigger', () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger>Right click me</ContextMenuTrigger>
      </ContextMenu>
    );

    expect(screen.getByText('Right click me')).toBeInTheDocument();
  });

  it('trigger has data-slot attribute', () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger data-testid="trigger">Right click me</ContextMenuTrigger>
      </ContextMenu>
    );

    expect(screen.getByTestId('trigger')).toHaveAttribute('data-slot', 'context-menu-trigger');
  });
});

describe('ContextMenuGroup', () => {
  it('can be imported', () => {
    expect(ContextMenuGroup).toBeDefined();
    expect(typeof ContextMenuGroup).toBe('function');
  });
});

describe('ContextMenuSub', () => {
  it('can be imported', () => {
    expect(ContextMenuSub).toBeDefined();
    expect(typeof ContextMenuSub).toBe('function');
  });
});

describe('ContextMenuRadioGroup', () => {
  it('can be imported', () => {
    expect(ContextMenuRadioGroup).toBeDefined();
    expect(typeof ContextMenuRadioGroup).toBe('function');
  });
});

describe('ContextMenuContent', () => {
  it('can be imported', () => {
    expect(ContextMenuContent).toBeDefined();
    expect(typeof ContextMenuContent).toBe('function');
  });
});

describe('ContextMenuSubContent', () => {
  it('can be imported', () => {
    expect(ContextMenuSubContent).toBeDefined();
    expect(typeof ContextMenuSubContent).toBe('function');
  });
});

describe('ContextMenuSubTrigger', () => {
  it('can be imported', () => {
    expect(ContextMenuSubTrigger).toBeDefined();
    expect(typeof ContextMenuSubTrigger).toBe('function');
  });
});

describe('ContextMenuItem', () => {
  it('can be imported', () => {
    expect(ContextMenuItem).toBeDefined();
    expect(typeof ContextMenuItem).toBe('function');
  });
});

describe('ContextMenuCheckboxItem', () => {
  it('can be imported', () => {
    expect(ContextMenuCheckboxItem).toBeDefined();
    expect(typeof ContextMenuCheckboxItem).toBe('function');
  });
});

describe('ContextMenuRadioItem', () => {
  it('can be imported', () => {
    expect(ContextMenuRadioItem).toBeDefined();
    expect(typeof ContextMenuRadioItem).toBe('function');
  });
});

describe('ContextMenuLabel', () => {
  it('can be imported', () => {
    expect(ContextMenuLabel).toBeDefined();
    expect(typeof ContextMenuLabel).toBe('function');
  });
});

describe('ContextMenuSeparator', () => {
  it('can be imported', () => {
    expect(ContextMenuSeparator).toBeDefined();
    expect(typeof ContextMenuSeparator).toBe('function');
  });
});

describe('ContextMenuShortcut', () => {
  it('can be imported', () => {
    expect(ContextMenuShortcut).toBeDefined();
    expect(typeof ContextMenuShortcut).toBe('function');
  });
});
