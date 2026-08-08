/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { GravatarAvatar } from './gravatar-avatar';

const useGravatarHashMock = vi.fn();
vi.mock('@/hooks/use-gravatar-hash', () => ({
  useGravatarHash: (email?: string) => useGravatarHashMock(email) as string,
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar" className={className}>
      {children}
    </div>
  ),
  AvatarImage: ({ src, alt }: { src: string; alt: string }) => (
    <div data-testid="avatar-image" data-src={src} data-alt={alt} />
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="avatar-fallback">{children}</span>
  ),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: Array<string | undefined>) => args.filter(Boolean).join(' '),
}));

describe('GravatarAvatar', () => {
  beforeEach(() => {
    useGravatarHashMock.mockReturnValue('computed-hash-hex');
  });

  it('renders avatar with gravatar URL from the client-computed email hash', () => {
    render(<GravatarAvatar email="test@example.com" />);

    const img = screen.getByTestId('avatar-image');
    expect(img).toHaveAttribute(
      'data-src',
      expect.stringContaining('https://www.gravatar.com/avatar/computed-hash-hex')
    );
    expect(img).toHaveAttribute('data-src', expect.stringContaining('d=retro'));
    expect(img).toHaveAttribute('data-src', expect.stringContaining('s=48'));
    expect(useGravatarHashMock).toHaveBeenCalledWith('test@example.com');
  });

  it('prefers a precomputed hash prop over client-side hashing', () => {
    render(<GravatarAvatar hash="server-hash" email="test@example.com" />);

    const img = screen.getByTestId('avatar-image');
    expect(img).toHaveAttribute(
      'data-src',
      expect.stringContaining('https://www.gravatar.com/avatar/server-hash')
    );
    expect(useGravatarHashMock).toHaveBeenCalledWith(undefined);
  });

  it('renders an empty-hash URL while the client hash is still resolving', () => {
    useGravatarHashMock.mockReturnValue('');

    render(<GravatarAvatar email="test@example.com" />);

    expect(screen.getByTestId('avatar-image')).toHaveAttribute(
      'data-src',
      'https://www.gravatar.com/avatar/?s=48&d=retro'
    );
  });

  it('renders with default size-13 class', () => {
    render(<GravatarAvatar email="test@example.com" />);

    expect(screen.getByTestId('avatar')).toHaveClass('size-13');
  });

  it('applies custom className', () => {
    render(<GravatarAvatar email="test@example.com" className="custom-class" />);

    const avatar = screen.getByTestId('avatar');
    expect(avatar).toHaveClass('size-13');
    expect(avatar).toHaveClass('custom-class');
  });

  it('shows initials from firstName and surname as fallback', () => {
    render(<GravatarAvatar email="test@example.com" firstName="John" surname="Doe" />);

    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('JD');
  });

  it('derives fallback initials from email when no name provided', () => {
    render(<GravatarAvatar email="john.doe@example.com" />);

    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('JD');
  });

  it('derives single initial from simple email', () => {
    render(<GravatarAvatar email="admin@example.com" />);

    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('A');
  });
});
