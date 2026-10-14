/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { HeaderBackdrop } from './header-backdrop';

describe('HeaderBackdrop', () => {
  it('clips its animated layers inside its own wrapper', () => {
    const { container } = render(<HeaderBackdrop />);
    const wrapper = container.firstElementChild;
    // `absolute inset-0` make the clip actually cover the header container —
    // without them `overflow-hidden` clips a zero-sized box.
    const tokens = (wrapper?.className ?? '').split(/\s+/);
    expect(tokens).toContain('overflow-hidden');
    expect(tokens).toContain('absolute');
    expect(tokens).toContain('inset-0');
    expect(wrapper?.getAttribute('aria-hidden')).toBe('true');
  });

  describe('animated background', () => {
    it('renders background div with CSS animation class', () => {
      const { container } = render(<HeaderBackdrop />);
      const bgDiv = container.querySelector('.header-bg-pulse');
      expect(bgDiv).toBeInTheDocument();
    });

    it('paints the dark particle backdrop below xl', () => {
      const { container } = render(<HeaderBackdrop />);
      const bgDiv = container.querySelector('.header-bg-pulse');
      expect(bgDiv).toHaveClass('absolute', 'inset-0', 'bg-black');
    });

    it('keeps the black base under the xl starfield so the masthead never flashes kraft', () => {
      const { container } = render(<HeaderBackdrop />);
      const bgDiv = container.querySelector('.header-bg-pulse');
      // The starfield tile is a network-loaded background-image on ::before —
      // it is only requested after first paint. Without a black base color the
      // masthead renders transparent (kraft desk + unreadable nav) until the
      // tile arrives on cold loads.
      expect(bgDiv).toHaveClass('bg-black');
      expect(bgDiv).not.toHaveClass('xl:bg-transparent');
      expect(bgDiv?.className).toContain('xl:before:bg-[url(/media/ffinc-starfield-tile.png)]');
    });

    it('paints the mobile particle texture as a low-priority image so it yields bandwidth to the LCP banner', () => {
      // A CSS background in the viewport is fetched at high priority, and the
      // particle SVG is the largest asset on a phone's first paint (~77 KiB
      // over the wire). As an <img> it can carry fetchpriority=low, so the
      // hero banner and the stylesheet get the bandwidth first; eager loading
      // still starts it at render so the masthead texture is not deferred.
      const { container } = render(<HeaderBackdrop />);
      const particles = container.querySelector('.header-bg-pulse img');

      expect(particles?.getAttribute('src')).toContain('particles-6.svg');
      expect(particles).toHaveAttribute('fetchpriority', 'low');
      expect(particles).toHaveAttribute('loading', 'eager');
      expect(particles).toHaveAttribute('alt', '');
      expect(particles).toHaveClass('absolute', 'inset-0', 'object-cover', 'xl:hidden');
    });

    it('loads the particles from the same URL as the footer and nav-sheet backgrounds, so the file is fetched once', () => {
      // The footer (`bg-[url('/media/particles-6.svg')]`) and the mobile nav
      // backdrop utility paint the same texture from the app-origin path; a
      // CDN-prefixed src here would make the browser download the 77 KiB SVG
      // a second time.
      const { container } = render(<HeaderBackdrop />);
      const particles = container.querySelector('.header-bg-pulse img');

      expect(particles).toHaveAttribute('src', '/media/particles-6.svg');
    });

    it('leaves the particles out of the server markup so the texture never queues ahead of the first paint', () => {
      // Lighthouse's simulated LCP counts every request that starts before
      // the observed paint; mounting the texture after hydration keeps its
      // 77 KiB out of that set. The black base paints meanwhile, as before.
      const html = renderToString(<HeaderBackdrop />);

      expect(html).not.toContain('particles-6.svg');
    });

    it('no longer paints the particles as a ::before background below xl', () => {
      const { container } = render(<HeaderBackdrop />);
      const bgDiv = container.querySelector('.header-bg-pulse');

      expect(bgDiv?.className).not.toContain('particles-6.svg');
    });
  });

  describe('sparkle effects', () => {
    it('renders sparkle container', () => {
      const { container } = render(<HeaderBackdrop />);
      // The particle image is also pointer-events-none; the overlay is the
      // z-10 layer above it.
      const sparkleContainer = container.querySelector('.pointer-events-none.z-10');
      expect(sparkleContainer).toBeInTheDocument();
      expect(sparkleContainer).toHaveClass('absolute', 'inset-0', 'z-10');
    });

    it('generates 20 sparkles and 15 extinguish particles', () => {
      const { container } = render(<HeaderBackdrop />);
      const sparkles = container.querySelectorAll('.header-sparkle');
      const extinguish = container.querySelectorAll('.header-extinguish');
      expect(sparkles).toHaveLength(20);
      expect(extinguish).toHaveLength(15);
    });

    it('sparkles have absolute positioning', () => {
      const { container } = render(<HeaderBackdrop />);
      const sparkle = container.querySelector('.header-sparkle');
      expect(sparkle).toHaveClass('absolute', 'rounded-full');
    });

    it('sparkle elements have percentage-based positions', () => {
      const { container } = render(<HeaderBackdrop />);
      const sparkle = container.querySelector('.header-sparkle') as HTMLElement;
      expect(sparkle.style.left).toMatch(/%$/);
      expect(sparkle.style.top).toMatch(/%$/);
    });

    it('extinguish particles have orange color class', () => {
      const { container } = render(<HeaderBackdrop />);
      const extinguishParticle = container.querySelector('.header-extinguish');
      expect(extinguishParticle).toHaveClass('bg-orange-400');
    });
  });
});
