/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from './sidebar';

// Mock useIsMobile hook
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

describe('SidebarProvider', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <div>Content</div>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-wrapper"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <SidebarProvider className="custom-sidebar-wrapper">
        <div>Content</div>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-wrapper"]')).toHaveClass(
      'custom-sidebar-wrapper'
    );
  });

  it('renders children', () => {
    render(
      <SidebarProvider>
        <div data-testid="child">Content</div>
      </SidebarProvider>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('sets CSS variables for sidebar width', () => {
    render(
      <SidebarProvider>
        <div>Content</div>
      </SidebarProvider>
    );

    const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]');
    expect(wrapper).toHaveStyle({ '--sidebar-width': '16rem' });
  });
});

describe('Sidebar', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <div>Content</div>
        </Sidebar>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar"]')).toBeInTheDocument();
  });

  it('renders with default side prop (left)', () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <div>Content</div>
        </Sidebar>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-side="left"]')).toBeInTheDocument();
  });

  it('renders with right side prop', () => {
    render(
      <SidebarProvider>
        <Sidebar side="right">
          <div>Content</div>
        </Sidebar>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-side="right"]')).toBeInTheDocument();
  });

  it('renders with data-state attribute', () => {
    render(
      <SidebarProvider defaultOpen>
        <Sidebar>
          <div>Content</div>
        </Sidebar>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-state="expanded"]')).toBeInTheDocument();
  });

  it('renders with collapsed state when defaultOpen is false', () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <Sidebar>
          <div>Content</div>
        </Sidebar>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-state="collapsed"]')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <div data-testid="sidebar-child">Sidebar Content</div>
        </Sidebar>
      </SidebarProvider>
    );

    expect(screen.getByTestId('sidebar-child')).toBeInTheDocument();
  });

  it('renders with collapsible="none" variant', () => {
    render(
      <SidebarProvider>
        <Sidebar collapsible="none">
          <div>Content</div>
        </Sidebar>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar"]')).toBeInTheDocument();
  });
});

describe('SidebarTrigger', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarTrigger />
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-trigger"]')).toBeInTheDocument();
  });

  it('has sr-only text for accessibility', () => {
    render(
      <SidebarProvider>
        <SidebarTrigger />
      </SidebarProvider>
    );

    expect(screen.getByText('Toggle Sidebar')).toHaveClass('sr-only');
  });

  it('applies custom className', () => {
    render(
      <SidebarProvider>
        <SidebarTrigger className="custom-trigger" />
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-trigger"]')).toHaveClass('custom-trigger');
  });
});

describe('SidebarRail', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarRail />
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-rail"]')).toBeInTheDocument();
  });

  it('has aria-label for accessibility', () => {
    render(
      <SidebarProvider>
        <SidebarRail />
      </SidebarProvider>
    );

    expect(screen.getByLabelText('Toggle Sidebar')).toBeInTheDocument();
  });
});

describe('SidebarInset', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarInset>
          <div>Main content</div>
        </SidebarInset>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-inset"]')).toBeInTheDocument();
  });

  it('renders as main element', () => {
    render(
      <SidebarProvider>
        <SidebarInset>
          <div>Main content</div>
        </SidebarInset>
      </SidebarProvider>
    );

    expect(document.querySelector('main[data-slot="sidebar-inset"]')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <SidebarProvider>
        <SidebarInset className="custom-inset">
          <div>Main content</div>
        </SidebarInset>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-inset"]')).toHaveClass('custom-inset');
  });
});

describe('SidebarInput', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarInput placeholder="Search" />
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-input"]')).toBeInTheDocument();
  });

  it('accepts input', async () => {
    const user = userEvent.setup();

    render(
      <SidebarProvider>
        <SidebarInput placeholder="Search" />
      </SidebarProvider>
    );

    const input = screen.getByPlaceholderText('Search');
    await user.type(input, 'test query');

    expect(input).toHaveValue('test query');
  });
});

describe('SidebarHeader', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarHeader>Header Content</SidebarHeader>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-header"]')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <SidebarProvider>
        <SidebarHeader>
          <div data-testid="header-child">Header Content</div>
        </SidebarHeader>
      </SidebarProvider>
    );

    expect(screen.getByTestId('header-child')).toBeInTheDocument();
  });
});

describe('SidebarFooter', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarFooter>Footer Content</SidebarFooter>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-footer"]')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <SidebarProvider>
        <SidebarFooter>
          <div data-testid="footer-child">Footer Content</div>
        </SidebarFooter>
      </SidebarProvider>
    );

    expect(screen.getByTestId('footer-child')).toBeInTheDocument();
  });
});

describe('SidebarSeparator', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarSeparator />
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-separator"]')).toBeInTheDocument();
  });
});

describe('SidebarContent', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarContent>Content</SidebarContent>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-content"]')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <SidebarProvider>
        <SidebarContent>
          <div data-testid="content-child">Content</div>
        </SidebarContent>
      </SidebarProvider>
    );

    expect(screen.getByTestId('content-child')).toBeInTheDocument();
  });
});

describe('SidebarGroup', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarGroup>Group Content</SidebarGroup>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-group"]')).toBeInTheDocument();
  });
});

describe('SidebarGroupLabel', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarGroupLabel>Label</SidebarGroupLabel>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-group-label"]')).toBeInTheDocument();
  });

  it('renders text content', () => {
    render(
      <SidebarProvider>
        <SidebarGroupLabel>Group Label</SidebarGroupLabel>
      </SidebarProvider>
    );

    expect(screen.getByText('Group Label')).toBeInTheDocument();
  });
});

describe('SidebarGroupAction', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarGroupAction>Action</SidebarGroupAction>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-group-action"]')).toBeInTheDocument();
  });
});

describe('SidebarGroupContent', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarGroupContent>Content</SidebarGroupContent>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-group-content"]')).toBeInTheDocument();
  });
});

describe('SidebarMenu', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarMenu>
          <SidebarMenuItem>Item</SidebarMenuItem>
        </SidebarMenu>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-menu"]')).toBeInTheDocument();
  });

  it('renders as ul element', () => {
    render(
      <SidebarProvider>
        <SidebarMenu>
          <SidebarMenuItem>Item</SidebarMenuItem>
        </SidebarMenu>
      </SidebarProvider>
    );

    expect(document.querySelector('ul[data-slot="sidebar-menu"]')).toBeInTheDocument();
  });
});

describe('SidebarMenuItem', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarMenu>
          <SidebarMenuItem>Item</SidebarMenuItem>
        </SidebarMenu>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-menu-item"]')).toBeInTheDocument();
  });

  it('renders as li element', () => {
    render(
      <SidebarProvider>
        <SidebarMenu>
          <SidebarMenuItem>Item</SidebarMenuItem>
        </SidebarMenu>
      </SidebarProvider>
    );

    expect(document.querySelector('li[data-slot="sidebar-menu-item"]')).toBeInTheDocument();
  });
});

describe('SidebarMenuButton', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton>Button</SidebarMenuButton>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-menu-button"]')).toBeInTheDocument();
  });

  it('handles click events', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(
      <SidebarProvider>
        <SidebarMenuButton onClick={handleClick}>Click me</SidebarMenuButton>
      </SidebarProvider>
    );

    await user.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders with active state', () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton isActive>Active Button</SidebarMenuButton>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-active="true"]')).toBeInTheDocument();
  });

  it('renders with tooltip when provided as string', () => {
    render(
      <SidebarProvider defaultOpen={false}>
        <SidebarMenuButton tooltip="Tooltip text">Button</SidebarMenuButton>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-menu-button"]')).toBeInTheDocument();
  });
});

describe('SidebarMenuAction', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarMenuAction>Action</SidebarMenuAction>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-menu-action"]')).toBeInTheDocument();
  });
});

describe('SidebarMenuBadge', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarMenuBadge>5</SidebarMenuBadge>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-menu-badge"]')).toBeInTheDocument();
  });

  it('renders badge content', () => {
    render(
      <SidebarProvider>
        <SidebarMenuBadge>New</SidebarMenuBadge>
      </SidebarProvider>
    );

    expect(screen.getByText('New')).toBeInTheDocument();
  });
});

describe('SidebarMenuSkeleton', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarMenuSkeleton />
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-menu-skeleton"]')).toBeInTheDocument();
  });

  it('renders with icon skeleton when showIcon is true', () => {
    render(
      <SidebarProvider>
        <SidebarMenuSkeleton showIcon />
      </SidebarProvider>
    );

    expect(document.querySelector('[data-sidebar="menu-skeleton-icon"]')).toBeInTheDocument();
  });

  it('always renders text skeleton', () => {
    render(
      <SidebarProvider>
        <SidebarMenuSkeleton />
      </SidebarProvider>
    );

    expect(document.querySelector('[data-sidebar="menu-skeleton-text"]')).toBeInTheDocument();
  });
});

describe('SidebarMenuSub', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarMenuSub>
          <SidebarMenuSubItem>Sub Item</SidebarMenuSubItem>
        </SidebarMenuSub>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-menu-sub"]')).toBeInTheDocument();
  });

  it('renders as ul element', () => {
    render(
      <SidebarProvider>
        <SidebarMenuSub>
          <SidebarMenuSubItem>Sub Item</SidebarMenuSubItem>
        </SidebarMenuSub>
      </SidebarProvider>
    );

    expect(document.querySelector('ul[data-slot="sidebar-menu-sub"]')).toBeInTheDocument();
  });
});

describe('SidebarMenuSubItem', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarMenuSub>
          <SidebarMenuSubItem>Sub Item</SidebarMenuSubItem>
        </SidebarMenuSub>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-menu-sub-item"]')).toBeInTheDocument();
  });
});

describe('SidebarMenuSubButton', () => {
  it('renders with data-slot attribute', () => {
    render(
      <SidebarProvider>
        <SidebarMenuSubButton>Sub Button</SidebarMenuSubButton>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-slot="sidebar-menu-sub-button"]')).toBeInTheDocument();
  });

  it('renders with active state', () => {
    render(
      <SidebarProvider>
        <SidebarMenuSubButton isActive>Active Sub Button</SidebarMenuSubButton>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-active="true"]')).toBeInTheDocument();
  });

  it('renders with sm size', () => {
    render(
      <SidebarProvider>
        <SidebarMenuSubButton size="sm">Small Sub Button</SidebarMenuSubButton>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-size="sm"]')).toBeInTheDocument();
  });
});

describe('useSidebar hook', () => {
  it('throws error when used outside SidebarProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const TestComponent = () => {
      useSidebar();
      return null;
    };

    expect(() => render(<TestComponent />)).toThrow(
      'useSidebar must be used within a SidebarProvider.'
    );

    consoleSpy.mockRestore();
  });
});

describe('Keyboard shortcut', () => {
  it('toggles sidebar on Ctrl+B', async () => {
    render(
      <SidebarProvider defaultOpen>
        <Sidebar>
          <div>Content</div>
        </Sidebar>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-state="expanded"]')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });

    await waitFor(() => {
      expect(document.querySelector('[data-state="collapsed"]')).toBeInTheDocument();
    });
  });

  it('toggles sidebar on Cmd+B (Mac)', async () => {
    render(
      <SidebarProvider defaultOpen>
        <Sidebar>
          <div>Content</div>
        </Sidebar>
      </SidebarProvider>
    );

    expect(document.querySelector('[data-state="expanded"]')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'b', metaKey: true });

    await waitFor(() => {
      expect(document.querySelector('[data-state="collapsed"]')).toBeInTheDocument();
    });
  });
});
