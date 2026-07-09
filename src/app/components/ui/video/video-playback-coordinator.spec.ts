/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The coordinator is a module-scope singleton. Resetting the module registry
// between tests gives each test a pristine singleton without exposing a
// test-only mutator that would weaken the module in production.
describe('video playback coordinator', () => {
  let claimPlayback: (id: string, pause: () => void) => void;
  let releasePlayback: (id: string) => void;

  beforeEach(async () => {
    vi.resetModules();
    ({ claimPlayback, releasePlayback } = await import('./video-playback-coordinator'));
  });

  it('pauses the previous claimant when a different id claims playback', () => {
    const pausePrevious = vi.fn();
    claimPlayback('a', pausePrevious);
    claimPlayback('b', vi.fn());
    expect(pausePrevious).toHaveBeenCalledTimes(1);
  });

  it('does not pause a claimant that re-claims with the same id', () => {
    const pause = vi.fn();
    claimPlayback('a', pause);
    claimPlayback('a', pause);
    expect(pause).not.toHaveBeenCalled();
  });

  it('does not pause a released claimant when a new id claims', () => {
    const pausePrevious = vi.fn();
    claimPlayback('a', pausePrevious);
    releasePlayback('a');
    claimPlayback('b', vi.fn());
    expect(pausePrevious).not.toHaveBeenCalled();
  });

  it('ignores a release from a non-owning id', () => {
    const pauseOwner = vi.fn();
    claimPlayback('a', pauseOwner);
    releasePlayback('b');
    claimPlayback('c', vi.fn());
    expect(pauseOwner).toHaveBeenCalledTimes(1);
  });
});
