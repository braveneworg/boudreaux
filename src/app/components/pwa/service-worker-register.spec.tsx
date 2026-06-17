/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, render } from '@testing-library/react';

import { ServiceWorkerRegister } from './service-worker-register';

const register = vi.fn(() => Promise.resolve());

const setReadyState = (value: 'loading' | 'interactive' | 'complete'): void => {
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    get: () => value,
  });
};

const stubServiceWorker = (): void => {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register },
  });
};

const removeServiceWorker = (): void => {
  Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'serviceWorker');
};

describe('ServiceWorkerRegister', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    removeServiceWorker();
    register.mockReset();
    register.mockImplementation(() => Promise.resolve());
    setReadyState('complete');
  });

  it('registers /sw.js in production when the API is available', () => {
    vi.stubEnv('NODE_ENV', 'production');
    stubServiceWorker();

    render(<ServiceWorkerRegister />);

    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('does not register outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    stubServiceWorker();

    render(<ServiceWorkerRegister />);

    expect(register).not.toHaveBeenCalled();
  });

  it('does not register in E2E builds so navigation caching never flakes tests', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', 'true');
    stubServiceWorker();

    render(<ServiceWorkerRegister />);

    expect(register).not.toHaveBeenCalled();
  });

  it('does nothing when the browser lacks service worker support', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => render(<ServiceWorkerRegister />)).not.toThrow();
    expect(register).not.toHaveBeenCalled();
  });

  it('swallows a failed registration so the page never crashes', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubEnv('NODE_ENV', 'production');
    register.mockImplementation(() => Promise.reject(new Error('boom')));
    stubServiceWorker();

    render(<ServiceWorkerRegister />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      'Service worker registration failed:',
      expect.anything()
    );
    consoleSpy.mockRestore();
  });

  it('defers registration to the load event when the document is still loading', () => {
    vi.stubEnv('NODE_ENV', 'production');
    setReadyState('loading');
    stubServiceWorker();

    render(<ServiceWorkerRegister />);
    expect(register).not.toHaveBeenCalled();

    act(() => {
      globalThis.dispatchEvent(new Event('load'));
    });
    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('removes the load listener on unmount before it fires', () => {
    vi.stubEnv('NODE_ENV', 'production');
    setReadyState('loading');
    stubServiceWorker();

    const { unmount } = render(<ServiceWorkerRegister />);
    unmount();

    act(() => {
      globalThis.dispatchEvent(new Event('load'));
    });
    expect(register).not.toHaveBeenCalled();
  });
});
