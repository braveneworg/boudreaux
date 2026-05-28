/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render } from '@testing-library/react';

import { ServiceWorkerRegister } from './service-worker-register';

const register = vi.fn(() => Promise.resolve());

function stubServiceWorker(): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { register },
  });
}

function removeServiceWorker(): void {
  Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'serviceWorker');
}

describe('ServiceWorkerRegister', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    removeServiceWorker();
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
});
