/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render } from '@testing-library/react';

import { HeaderBackdrop } from './header-backdrop';

describe('HeaderBackdrop', () => {
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

    it('switches to a transparent backdrop at xl for the starfield', () => {
      const { container } = render(<HeaderBackdrop />);
      const bgDiv = container.querySelector('.header-bg-pulse');
      expect(bgDiv).toHaveClass('xl:bg-transparent');
    });
  });

  describe('sparkle effects', () => {
    it('renders sparkle container', () => {
      const { container } = render(<HeaderBackdrop />);
      const sparkleContainer = container.querySelector('.pointer-events-none');
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
