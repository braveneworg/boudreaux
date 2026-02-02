import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AdminPage from './page';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock BreadcrumbMenu
vi.mock('../components/ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: ({ items }: { items: { anchorText: string; url: string }[] }) => (
    <nav data-testid="breadcrumb">
      {items.map((item) => (
        <a key={item.url} href={item.url}>
          {item.anchorText}
        </a>
      ))}
    </nav>
  ),
}));

// Mock Combobox
vi.mock('@/components/forms/fields/combobox', () => ({
  Combobox: ({
    options,
    onSelectAction,
  }: {
    options: { value: string; label: string }[];
    onSelectAction: (value: string) => void;
  }) => (
    <div data-testid="combobox">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onSelectAction(opt.value)}
          data-testid={`option-${opt.value}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  ),
}));

// Mock DataView components
vi.mock('./data-views/artist-data-view', () => ({
  ArtistDataView: () => <div data-testid="artist-data-view">Artist Data View</div>,
}));

vi.mock('./data-views/group-data-view', () => ({
  GroupDataView: () => <div data-testid="group-data-view">Group Data View</div>,
}));

vi.mock('./data-views/release-data-view', () => ({
  ReleaseDataView: () => <div data-testid="release-data-view">Release Data View</div>,
}));

vi.mock('./data-views/track-data-view', () => ({
  TrackDataView: () => <div data-testid="track-data-view">Track Data View</div>,
}));

vi.mock('./data-views/featured-artist-data-view', () => ({
  FeaturedArtistDataView: () => (
    <div data-testid="featured-artist-data-view">Featured Artist Data View</div>
  ),
}));

describe('AdminPage', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders breadcrumb with Admin link', () => {
    render(<AdminPage />);

    expect(screen.getByTestId('breadcrumb')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });

  it('renders combobox with entity options', () => {
    render(<AdminPage />);

    expect(screen.getByTestId('combobox')).toBeInTheDocument();
    expect(screen.getByTestId('option-artist')).toBeInTheDocument();
    expect(screen.getByTestId('option-group')).toBeInTheDocument();
    expect(screen.getByTestId('option-release')).toBeInTheDocument();
    expect(screen.getByTestId('option-track')).toBeInTheDocument();
    expect(screen.getByTestId('option-featured artist')).toBeInTheDocument();
    expect(screen.getByTestId('option-notifications')).toBeInTheDocument();
  });

  it('displays title cased options', () => {
    render(<AdminPage />);

    expect(screen.getByText('Artist')).toBeInTheDocument();
    expect(screen.getByText('Group')).toBeInTheDocument();
    expect(screen.getByText('Release')).toBeInTheDocument();
    expect(screen.getByText('Track')).toBeInTheDocument();
    expect(screen.getByText('Featured Artist')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('shows artist data view by default', () => {
    render(<AdminPage />);

    expect(screen.getByTestId('artist-data-view')).toBeInTheDocument();
    expect(screen.queryByTestId('group-data-view')).not.toBeInTheDocument();
    expect(screen.queryByTestId('release-data-view')).not.toBeInTheDocument();
    expect(screen.queryByTestId('track-data-view')).not.toBeInTheDocument();
    expect(screen.queryByTestId('featured-artist-data-view')).not.toBeInTheDocument();
  });

  it('switches to group view when group is selected', async () => {
    render(<AdminPage />);

    await user.click(screen.getByTestId('option-group'));

    expect(screen.getByTestId('group-data-view')).toBeInTheDocument();
    expect(screen.queryByTestId('artist-data-view')).not.toBeInTheDocument();
  });

  it('switches to release view when release is selected', async () => {
    render(<AdminPage />);

    await user.click(screen.getByTestId('option-release'));

    expect(screen.getByTestId('release-data-view')).toBeInTheDocument();
    expect(screen.queryByTestId('artist-data-view')).not.toBeInTheDocument();
  });

  it('switches to track view when track is selected', async () => {
    render(<AdminPage />);

    await user.click(screen.getByTestId('option-track'));

    expect(screen.getByTestId('track-data-view')).toBeInTheDocument();
    expect(screen.queryByTestId('artist-data-view')).not.toBeInTheDocument();
  });

  it('switches to featured artist view when featured artist is selected', async () => {
    render(<AdminPage />);

    await user.click(screen.getByTestId('option-featured artist'));

    expect(screen.getByTestId('featured-artist-data-view')).toBeInTheDocument();
    expect(screen.queryByTestId('artist-data-view')).not.toBeInTheDocument();
  });

  it('navigates to notifications page when notifications is selected', async () => {
    render(<AdminPage />);

    await user.click(screen.getByTestId('option-notifications'));

    expect(mockPush).toHaveBeenCalledWith('/admin/notifications');
    // Should still show artist view since we navigated away
    expect(screen.getByTestId('artist-data-view')).toBeInTheDocument();
  });

  it('can switch back to artist view after selecting another view', async () => {
    render(<AdminPage />);

    await user.click(screen.getByTestId('option-group'));
    expect(screen.getByTestId('group-data-view')).toBeInTheDocument();

    await user.click(screen.getByTestId('option-artist'));
    expect(screen.getByTestId('artist-data-view')).toBeInTheDocument();
    expect(screen.queryByTestId('group-data-view')).not.toBeInTheDocument();
  });
});
