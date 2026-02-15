/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
} from './drawer';

describe('Drawer', () => {
  const renderDrawer = () => {
    return render(
      <Drawer>
        <DrawerTrigger asChild>
          <button>Open Drawer</button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Drawer Title</DrawerTitle>
            <DrawerDescription>Drawer description</DrawerDescription>
          </DrawerHeader>
          <div>Drawer content</div>
          <DrawerFooter>
            <DrawerClose asChild>
              <button>Close</button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  };

  describe('DrawerTrigger', () => {
    it('renders trigger button', () => {
      renderDrawer();

      expect(screen.getByRole('button', { name: 'Open Drawer' })).toBeInTheDocument();
    });

    it('has data-slot attribute', () => {
      render(
        <Drawer>
          <DrawerTrigger data-testid="trigger">Open</DrawerTrigger>
          <DrawerContent>Content</DrawerContent>
        </Drawer>
      );

      expect(screen.getByTestId('trigger')).toHaveAttribute('data-slot', 'drawer-trigger');
    });
  });

  describe('DrawerContent', () => {
    it('opens drawer on trigger click', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: 'Open Drawer' }));

      await waitFor(() => {
        expect(screen.getByText('Drawer Title')).toBeInTheDocument();
      });
    });

    it('has data-slot attribute when open', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: 'Open Drawer' }));

      await waitFor(() => {
        expect(document.querySelector('[data-slot="drawer-content"]')).toBeInTheDocument();
      });
    });
  });

  describe('DrawerHeader', () => {
    it('has data-slot attribute', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: 'Open Drawer' }));

      await waitFor(() => {
        expect(document.querySelector('[data-slot="drawer-header"]')).toBeInTheDocument();
      });
    });

    it('renders children', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: 'Open Drawer' }));

      await waitFor(() => {
        expect(screen.getByText('Drawer Title')).toBeInTheDocument();
        expect(screen.getByText('Drawer description')).toBeInTheDocument();
      });
    });
  });

  describe('DrawerFooter', () => {
    it('has data-slot attribute', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: 'Open Drawer' }));

      await waitFor(() => {
        expect(document.querySelector('[data-slot="drawer-footer"]')).toBeInTheDocument();
      });
    });

    it('renders children', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: 'Open Drawer' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
      });
    });
  });

  describe('DrawerTitle', () => {
    it('has data-slot attribute', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: 'Open Drawer' }));

      await waitFor(() => {
        expect(document.querySelector('[data-slot="drawer-title"]')).toBeInTheDocument();
      });
    });
  });

  describe('DrawerDescription', () => {
    it('has data-slot attribute', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: 'Open Drawer' }));

      await waitFor(() => {
        expect(document.querySelector('[data-slot="drawer-description"]')).toBeInTheDocument();
      });
    });
  });

  describe('DrawerClose', () => {
    it('has data-slot attribute', async () => {
      const user = userEvent.setup();
      render(
        <Drawer>
          <DrawerTrigger>Open</DrawerTrigger>
          <DrawerContent>
            <DrawerClose data-testid="close-btn">Close</DrawerClose>
          </DrawerContent>
        </Drawer>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByTestId('close-btn')).toHaveAttribute('data-slot', 'drawer-close');
      });
    });

    // Note: Close functionality test skipped due to vaul library issues in JSDOM
  });

  describe('integration', () => {
    it('renders complete drawer with all parts', async () => {
      const user = userEvent.setup();
      renderDrawer();

      await user.click(screen.getByRole('button', { name: 'Open Drawer' }));

      await waitFor(() => {
        expect(screen.getByText('Drawer Title')).toBeInTheDocument();
        expect(screen.getByText('Drawer description')).toBeInTheDocument();
        expect(screen.getByText('Drawer content')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
      });
    });

    it('supports controlled open state', async () => {
      render(
        <Drawer open>
          <DrawerTrigger>Open</DrawerTrigger>
          <DrawerContent>
            <DrawerTitle>Controlled Drawer</DrawerTitle>
          </DrawerContent>
        </Drawer>
      );

      expect(screen.getByText('Controlled Drawer')).toBeInTheDocument();
    });
  });
});
