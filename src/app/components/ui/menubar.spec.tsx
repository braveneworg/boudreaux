/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarLabel,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarPortal,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarGroup,
  MenubarSub,
  MenubarShortcut,
} from './menubar';

describe('Menubar', () => {
  it('renders', () => {
    render(
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
        </MenubarMenu>
      </Menubar>
    );

    expect(screen.getByRole('menubar')).toBeInTheDocument();
  });

  it('has data-slot attribute', () => {
    render(
      <Menubar data-testid="menubar">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
        </MenubarMenu>
      </Menubar>
    );

    expect(screen.getByTestId('menubar')).toHaveAttribute('data-slot', 'menubar');
  });

  it('applies custom className', () => {
    render(
      <Menubar className="custom-menubar">
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
        </MenubarMenu>
      </Menubar>
    );

    expect(screen.getByRole('menubar')).toHaveClass('custom-menubar');
  });
});

describe('MenubarTrigger', () => {
  it('renders', () => {
    render(
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
        </MenubarMenu>
      </Menubar>
    );

    expect(screen.getByText('File')).toBeInTheDocument();
  });

  it('has data-slot attribute', () => {
    render(
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger data-testid="trigger">File</MenubarTrigger>
        </MenubarMenu>
      </Menubar>
    );

    expect(screen.getByTestId('trigger')).toHaveAttribute('data-slot', 'menubar-trigger');
  });
});

describe('MenubarMenu', () => {
  it('can be imported', () => {
    expect(MenubarMenu).toBeDefined();
    expect(typeof MenubarMenu).toBe('function');
  });
});

describe('MenubarGroup', () => {
  it('can be imported', () => {
    expect(MenubarGroup).toBeDefined();
    expect(typeof MenubarGroup).toBe('function');
  });
});

describe('MenubarPortal', () => {
  it('can be imported', () => {
    expect(MenubarPortal).toBeDefined();
    expect(typeof MenubarPortal).toBe('function');
  });
});

describe('MenubarRadioGroup', () => {
  it('can be imported', () => {
    expect(MenubarRadioGroup).toBeDefined();
    expect(typeof MenubarRadioGroup).toBe('function');
  });
});

describe('MenubarContent', () => {
  it('can be imported', () => {
    expect(MenubarContent).toBeDefined();
    expect(typeof MenubarContent).toBe('function');
  });
});

describe('MenubarSubContent', () => {
  it('can be imported', () => {
    expect(MenubarSubContent).toBeDefined();
    expect(typeof MenubarSubContent).toBe('function');
  });
});

describe('MenubarSubTrigger', () => {
  it('can be imported', () => {
    expect(MenubarSubTrigger).toBeDefined();
    expect(typeof MenubarSubTrigger).toBe('function');
  });
});

describe('MenubarSub', () => {
  it('can be imported', () => {
    expect(MenubarSub).toBeDefined();
    expect(typeof MenubarSub).toBe('function');
  });
});

describe('MenubarItem', () => {
  it('can be imported', () => {
    expect(MenubarItem).toBeDefined();
    expect(typeof MenubarItem).toBe('function');
  });
});

describe('MenubarCheckboxItem', () => {
  it('can be imported', () => {
    expect(MenubarCheckboxItem).toBeDefined();
    expect(typeof MenubarCheckboxItem).toBe('function');
  });
});

describe('MenubarRadioItem', () => {
  it('can be imported', () => {
    expect(MenubarRadioItem).toBeDefined();
    expect(typeof MenubarRadioItem).toBe('function');
  });
});

describe('MenubarLabel', () => {
  it('can be imported', () => {
    expect(MenubarLabel).toBeDefined();
    expect(typeof MenubarLabel).toBe('function');
  });
});

describe('MenubarSeparator', () => {
  it('can be imported', () => {
    expect(MenubarSeparator).toBeDefined();
    expect(typeof MenubarSeparator).toBe('function');
  });
});

describe('MenubarShortcut', () => {
  it('can be imported', () => {
    expect(MenubarShortcut).toBeDefined();
    expect(typeof MenubarShortcut).toBe('function');
  });
});
