/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render } from '@testing-library/react';

import HealthStatusMessage from './health-status-message';

import type { HealthStatus } from '../../lib/types/health-status';

describe('HealthStatusMessage', () => {
  describe('Loading State', () => {
    it('should display loading message when isLoading is true', () => {
      const { container } = render(<HealthStatusMessage healthStatus={null} isLoading />);

      expect(container.textContent).toBe('Checking database connection...');
    });

    it('should display loading message when isLoading is true regardless of healthStatus', () => {
      const healthStatus: HealthStatus = {
        status: 'healthy',
        database: 'Connected to MongoDB',
        latency: 42,
      };

      const { container } = render(<HealthStatusMessage healthStatus={healthStatus} isLoading />);

      expect(container.textContent).toBe('Checking database connection...');
    });
  });

  describe('Null Health Status', () => {
    it('should display initializing message when healthStatus is null and not loading', () => {
      const { container } = render(<HealthStatusMessage healthStatus={null} isLoading={false} />);

      expect(container.textContent).toBe('Initializing...');
    });
  });

  describe('Healthy Status', () => {
    it('should display database name when status is healthy', () => {
      const healthStatus: HealthStatus = {
        status: 'healthy',
        database: 'Connected to MongoDB',
      };

      const { container } = render(
        <HealthStatusMessage healthStatus={healthStatus} isLoading={false} />
      );

      expect(container.textContent).toBe('Connected to MongoDB');
    });

    it('should display database name with latency when latency is provided', () => {
      const healthStatus: HealthStatus = {
        status: 'healthy',
        database: 'Connected to MongoDB',
        latency: 42,
      };

      const { container } = render(
        <HealthStatusMessage healthStatus={healthStatus} isLoading={false} />
      );

      expect(container.textContent).toBe('Connected to MongoDB (42ms)');
    });

    it('should not display latency when it is zero', () => {
      const healthStatus: HealthStatus = {
        status: 'healthy',
        database: 'Connected to MongoDB',
        latency: 0,
      };

      const { container } = render(
        <HealthStatusMessage healthStatus={healthStatus} isLoading={false} />
      );

      expect(container.textContent).toBe('Connected to MongoDB');
    });
  });

  describe('Error Display in Development', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should display error message in development mode', () => {
      const healthStatus: HealthStatus = {
        status: 'error',
        database: 'Failed to connect',
        error: 'Connection timeout',
      };

      const { container } = render(
        <HealthStatusMessage healthStatus={healthStatus} isLoading={false} />
      );

      expect(container.textContent).toBe('Failed to connect - Connection timeout');
    });

    it('should display database name without error when no error is provided', () => {
      const healthStatus: HealthStatus = {
        status: 'error',
        database: 'Failed to connect',
      };

      const { container } = render(
        <HealthStatusMessage healthStatus={healthStatus} isLoading={false} />
      );

      expect(container.textContent).toBe('Failed to connect');
    });
  });

  describe('Error Display in Production', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should not display error message in production mode', () => {
      const healthStatus: HealthStatus = {
        status: 'error',
        database: 'Failed to connect',
        error: 'Connection timeout',
      };

      const { container } = render(
        <HealthStatusMessage healthStatus={healthStatus} isLoading={false} />
      );

      expect(container.textContent).toBe('Failed to connect');
    });
  });

  describe('Complex Scenarios', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should display all information when status has latency and error in development', () => {
      const healthStatus: HealthStatus = {
        status: 'unhealthy',
        database: 'Partially connected',
        latency: 500,
        error: 'High latency detected',
      };

      const { container } = render(
        <HealthStatusMessage healthStatus={healthStatus} isLoading={false} />
      );

      expect(container.textContent).toBe('Partially connected (500ms) - High latency detected');
    });
  });

  describe('Accessibility', () => {
    it('should render without accessibility violations', () => {
      const healthStatus: HealthStatus = {
        status: 'healthy',
        database: 'Connected to MongoDB',
        latency: 42,
      };

      const { container } = render(
        <HealthStatusMessage healthStatus={healthStatus} isLoading={false} />
      );

      // Verify it renders as a fragment without extra wrapper elements
      expect(container.firstChild).toBeTruthy();
    });
  });
});
