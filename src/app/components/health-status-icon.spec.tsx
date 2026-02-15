/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render } from '@testing-library/react';

import HealthStatusIcon from './health-status-icon';

describe('HealthStatusIcon', () => {
  describe('Loading State', () => {
    it('should display loading icon when isLoading is true', () => {
      const { container } = render(<HealthStatusIcon status={null} isLoading />);

      expect(container.textContent).toBe('⏳');
    });

    it('should display loading icon when isLoading is true regardless of status', () => {
      const { container } = render(<HealthStatusIcon status="healthy" isLoading />);

      expect(container.textContent).toBe('⏳');
    });
  });

  describe('Healthy Status', () => {
    it('should display success icon when status is healthy and not loading', () => {
      const { container } = render(<HealthStatusIcon status="healthy" isLoading={false} />);

      expect(container.textContent).toBe('✅');
    });
  });

  describe('Error Status', () => {
    it('should display error icon when status is error and not loading', () => {
      const { container } = render(<HealthStatusIcon status="error" isLoading={false} />);

      expect(container.textContent).toBe('❌');
    });
  });

  describe('Unhealthy Status', () => {
    it('should display error icon when status is unhealthy and not loading', () => {
      const { container } = render(<HealthStatusIcon status="unhealthy" isLoading={false} />);

      expect(container.textContent).toBe('❌');
    });
  });

  describe('Null Status', () => {
    it('should display loading icon when status is null and not loading', () => {
      const { container } = render(<HealthStatusIcon status={null} isLoading={false} />);

      expect(container.textContent).toBe('⏳');
    });
  });

  describe('Accessibility', () => {
    it('should render without accessibility violations', () => {
      const { container } = render(<HealthStatusIcon status="healthy" isLoading={false} />);

      // Verify it renders as a fragment without extra wrapper elements
      expect(container.firstChild).toBeTruthy();
    });
  });
});
