import { headers } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import { userAgentFromString } from 'next/server'; // For App Router

import { cn } from '@/app/lib/utils/auth/tailwind-utils';

const Header = async () => {
  const userAgent = (await headers()).get('user-agent') || '';
  const { device } = userAgentFromString(userAgent);
  const isMobile = device?.type === 'mobile' || device?.type === 'tablet';

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] py-2.5 opacity-95 w-screen bg-zinc-950 url('/media/stardust.svg') bg-cover bg-center">
      <div className="mx-auto w-full max-w-[1920px] px-1 pb-1 md:px-8 md:py-4">
        <header className="flex justify-between h-[22px] md:h-[144px] w-full 2xl:min-w-[1864px]">
          <Link className="flex pl-1" href="/">
            <Image
              alt="Fake Four Inc. Logo"
              className={cn(
                { 'relative -top-0.75': isMobile },
                'size-[32px] md:size-[144px] rounded-full bg-white'
              )}
              height={44}
              priority
              src={
                isMobile
                  ? '/media/fake-four-inc-black-hand-logo.svg'
                  : '/media/fake-four-inc-black-stardust-hand-logo.svg'
              }
              width={44}
            />
          </Link>
          {isMobile && (
            <div className="flex relative -top-[1px] right-8 items-center justify-center">
              <Image
                alt="Fake Four Inc. Words"
                className="w-[244px] mx-auto"
                height={44}
                src="/media/fake-four-inc-words.png"
                width={444}
              />
            </div>
          )}
        </header>
      </div>
    </div>
  );
};

export default Header;
