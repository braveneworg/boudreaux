/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render } from '@testing-library/react';

import {
  AppleIcon,
  GoogleIcon,
  FacebookIcon as BrandFacebookIcon,
  XIcon as BrandXIcon,
} from './brand-icons';

describe('BrandIcons', () => {
  describe('AppleIcon', () => {
    it('renders an SVG with aria-hidden', () => {
      render(<AppleIcon />);
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    it('accepts a className prop', () => {
      render(<AppleIcon className="custom-class" />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveClass('custom-class');
    });

    it('uses currentColor fill', () => {
      render(<AppleIcon />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveAttribute('fill', 'currentColor');
    });
  });

  describe('GoogleIcon', () => {
    it('renders an SVG with aria-hidden', () => {
      render(<GoogleIcon />);
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    it('accepts a className prop', () => {
      render(<GoogleIcon className="size-5" />);
      const svg = document.querySelector('svg');
      expect(svg).toHaveClass('size-5');
    });
  });

  describe('FacebookIcon (brand)', () => {
    it('renders an SVG with aria-hidden', () => {
      render(<BrandFacebookIcon />);
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });

  describe('XIcon (brand)', () => {
    it('renders an SVG with aria-hidden', () => {
      render(<BrandXIcon />);
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    });
  });
});
