/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ReleaseForm from '@/app/components/forms/release-form';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
  usePathname: () => '/admin/releases/new',
}));

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1', name: 'Admin', role: 'admin' } },
    status: 'authenticated',
  }),
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock server actions
vi.mock('@/lib/actions/create-release-action', () => ({
  createReleaseAction: vi.fn(),
}));
vi.mock('@/lib/actions/update-release-action', () => ({
  updateReleaseAction: vi.fn(),
}));
vi.mock('@/lib/actions/presigned-upload-actions', () => ({
  getPresignedUploadUrlsAction: vi.fn(),
}));
vi.mock('@/lib/actions/register-image-actions', () => ({
  registerReleaseImagesAction: vi.fn(),
}));
vi.mock('@/lib/actions/release-image-actions', () => ({
  deleteReleaseImageAction: vi.fn(),
  reorderReleaseImagesAction: vi.fn(),
}));
vi.mock('@/lib/utils/direct-upload', () => ({
  uploadFilesToS3: vi.fn(),
}));
vi.mock('@/lib/utils/console-logger', () => ({
  error: vi.fn(),
}));

// Mock complex sub-components to keep tests focused
vi.mock('@/app/components/forms/digital-formats-accordion', () => ({
  DigitalFormatsAccordion: () => <div data-testid="digital-formats-accordion" />,
}));
vi.mock('@/app/components/forms/fields/artist-multi-select', () => ({
  default: () => <div data-testid="artist-multi-select" />,
}));
vi.mock('@/app/components/forms/fields/cover-art-field', () => ({
  default: () => <div data-testid="cover-art-field" />,
}));
vi.mock('@/app/components/ui/image-uploader', () => ({
  ImageUploader: () => <div data-testid="image-uploader" />,
}));
vi.mock('../ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: () => <div data-testid="breadcrumb-menu" />,
}));
vi.mock('../ui/datepicker', () => ({
  DatePicker: ({
    onChange,
    value,
    label,
  }: {
    onChange: (d: string) => void;
    value: string;
    label: string;
  }) => (
    <input
      data-testid={`datepicker-${label?.toLowerCase().replace(/\s+/g, '-')}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    />
  ),
}));

describe('ReleaseForm — suggestedPrice field', () => {
  it('should render the suggested price input field', async () => {
    render(<ReleaseForm />);

    await waitFor(() => {
      expect(screen.getByLabelText('Suggested price in dollars')).toBeInTheDocument();
    });
  });

  it('should render with correct label text', async () => {
    render(<ReleaseForm />);

    await waitFor(() => {
      expect(screen.getByText('Suggested Price (USD)')).toBeInTheDocument();
    });
  });

  it('should render the description text', async () => {
    render(<ReleaseForm />);

    await waitFor(() => {
      expect(screen.getByText('Optional pay-what-you-want suggested price')).toBeInTheDocument();
    });
  });

  it('should render with placeholder text', async () => {
    render(<ReleaseForm />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g., 7.99')).toBeInTheDocument();
    });
  });

  it('should accept a valid price input', async () => {
    const user = userEvent.setup();
    render(<ReleaseForm />);

    const input = await screen.findByLabelText('Suggested price in dollars');
    await user.type(input, '9.99');

    expect(input).toHaveValue('9.99');
  });

  it('should have decimal inputMode for mobile keyboard', async () => {
    render(<ReleaseForm />);

    const input = await screen.findByLabelText('Suggested price in dollars');
    expect(input).toHaveAttribute('inputMode', 'decimal');
  });

  it('should start with empty value by default', async () => {
    render(<ReleaseForm />);

    const input = await screen.findByLabelText('Suggested price in dollars');
    expect(input).toHaveValue('');
  });
});
