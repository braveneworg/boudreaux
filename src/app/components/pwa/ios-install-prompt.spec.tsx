/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';

import { IosInstallPrompt } from './ios-install-prompt';

const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IOS_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

function setUserAgent(ua: string): void {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua });
}

function setStandalone(value: boolean | undefined): void {
  Object.defineProperty(navigator, 'standalone', { configurable: true, value });
}

function setDisplayModeStandalone(matches: boolean): void {
  vi.mocked(globalThis.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('standalone') ? matches : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        onchange: null,
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList
  );
}

describe('IosInstallPrompt', () => {
  beforeEach(() => {
    setUserAgent(IOS_SAFARI_UA);
    setStandalone(false);
    setDisplayModeStandalone(false);
    document.cookie = 'ffi-ios-install-dismissed=; path=/; max-age=0';
  });

  it('shows Add to Home Screen instructions on iOS Safari', () => {
    render(<IosInstallPrompt />);

    expect(screen.getByRole('dialog', { name: /install/i })).toBeInTheDocument();
    expect(screen.getByText(/add to home screen/i)).toBeInTheDocument();
  });

  it('does not render in third-party iOS browsers like Chrome', () => {
    setUserAgent(IOS_CHROME_UA);

    render(<IosInstallPrompt />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not render on non-iOS platforms', () => {
    setUserAgent(ANDROID_UA);

    render(<IosInstallPrompt />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not render when already installed as a standalone app', () => {
    setStandalone(true);

    render(<IosInstallPrompt />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not render when display-mode is standalone', () => {
    setStandalone(undefined);
    setDisplayModeStandalone(true);

    render(<IosInstallPrompt />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides and remembers dismissal when the close button is clicked', async () => {
    const user = userEvent.setup({ delay: null, advanceTimers: vi.advanceTimersByTime });
    const { unmount } = render(<IosInstallPrompt />);

    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    unmount();
    render(<IosInstallPrompt />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
