/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
} from './navigation-menu';

describe('NavigationMenu', () => {
  it('renders', () => {
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Item</NavigationMenuTrigger>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    );

    expect(document.querySelector('[data-slot="navigation-menu"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <NavigationMenu className="custom-nav" data-testid="nav">
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Item</NavigationMenuTrigger>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    );

    expect(screen.getByTestId('nav')).toHaveClass('custom-nav');
  });

  it('renders without viewport when viewport=false', () => {
    render(
      <NavigationMenu viewport={false}>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Item</NavigationMenuTrigger>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    );

    expect(
      document.querySelector('[data-slot="navigation-menu-viewport"]')
    ).not.toBeInTheDocument();
  });
});

describe('NavigationMenuList', () => {
  it('renders', () => {
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Item</NavigationMenuTrigger>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    );

    expect(document.querySelector('[data-slot="navigation-menu-list"]')).toBeInTheDocument();
  });
});

describe('NavigationMenuItem', () => {
  it('renders', () => {
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Item</NavigationMenuTrigger>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    );

    expect(document.querySelector('[data-slot="navigation-menu-item"]')).toBeInTheDocument();
  });
});

describe('NavigationMenuTrigger', () => {
  it('renders', () => {
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Click me</NavigationMenuTrigger>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    );

    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('has data-slot attribute', () => {
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger data-testid="trigger">Item</NavigationMenuTrigger>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    );

    expect(screen.getByTestId('trigger')).toHaveAttribute('data-slot', 'navigation-menu-trigger');
  });
});

describe('NavigationMenuContent', () => {
  it('can be imported', () => {
    expect(NavigationMenuContent).toBeDefined();
    expect(typeof NavigationMenuContent).toBe('function');
  });
});

describe('NavigationMenuLink', () => {
  it('can be imported', () => {
    expect(NavigationMenuLink).toBeDefined();
    expect(typeof NavigationMenuLink).toBe('function');
  });

  it('renders with data-slot attribute', () => {
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink data-testid="link" href="#">
              Link
            </NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    );

    expect(screen.getByTestId('link')).toHaveAttribute('data-slot', 'navigation-menu-link');
  });

  it('applies custom className', () => {
    render(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuLink data-testid="link" className="custom-link" href="#">
              Link
            </NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    );

    expect(screen.getByTestId('link')).toHaveClass('custom-link');
  });
});

describe('NavigationMenuIndicator', () => {
  it('can be imported', () => {
    expect(NavigationMenuIndicator).toBeDefined();
    expect(typeof NavigationMenuIndicator).toBe('function');
  });
});

describe('NavigationMenuViewport', () => {
  it('can be imported', () => {
    expect(NavigationMenuViewport).toBeDefined();
    expect(typeof NavigationMenuViewport).toBe('function');
  });
});

describe('navigationMenuTriggerStyle', () => {
  it('returns a string', () => {
    const result = navigationMenuTriggerStyle();
    expect(typeof result).toBe('string');
  });
});
