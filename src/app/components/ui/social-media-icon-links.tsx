import Image from 'next/image';
import Link from 'next/link';

import { cn } from '@/lib/utils/tailwind-utils';

const menuLinks = [
  {
    href: 'https://facebook.com/fakefourinc',
    icon: '/media/icons/social-media/facebook-icon.svg',
    label: 'Facebook',
  },
  {
    href: 'https://instagram.com/fakefourinc',
    icon: '/media/icons/social-media/instagram-icon.svg',
    label: 'Instagram',
  },
  {
    href: 'https://YouTube.com/fakefourinc',
    icon: '/media/icons/social-media/youtube-icon.svg',
    label: 'YouTube',
  },
  {
    href: 'https://fakefour.bandcamp.com',
    icon: '/media/icons/social-media/bandcamp-icon.svg',
    label: 'Bandcamp',
  },
  {
    href: 'https://x.com/fakefour',
    icon: '/media/icons/social-media/x-icon.svg',
    label: 'X',
  },
  {
    href: 'https://tiktok.com/@fakefourinc',
    icon: '/media/icons/social-media/tiktok-icon.svg',
    label: 'TikTok',
  },
  {
    href: 'https://open.spotify.com/user/fakefourinc',
    icon: '/media/icons/social-media/spotify-icon.svg',
    label: 'Spotify',
  },
];

const SocialMediaIconLinks = ({ className }: { className: string }) => (
  <div
    className={cn(['flex flex-wrap py-1 mb-4 justify-end border-b-1 border-b-white', className])}
  >
    {menuLinks.map((link) => (
      <Link
        aria-label={link.label}
        className="w-[40px] px-2 transition-transform md:hover:scale-[107.5%]"
        data-testid={`${link.label.toLowerCase()}-icon`}
        href={link.href}
        key={link.href}
        rel="noopener"
        target="_blank"
        title={link.label}
      >
        <Image alt={link.label} height={40} src={link.icon} width={40} />
        <span className="sr-only">{link.label}</span>
      </Link>
    ))}
  </div>
);

export default SocialMediaIconLinks;
