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
      <div className="mx-auto w-full max-w-[1920px] px-1 pb-1 md:px-8">
        <header className="flex justify-start h-[56px] md:h-[144px] 2xl:min-w-[1864px]">
          <Link className="flex" href="/">
            <Image
              alt="Fake Four Inc. Logo"
              className={cn(
                'relative top-0.5 ml-2 size-[56px] md:size-[144px] rounded-full bg-white'
              )}
              height={56}
              priority
              src={
                isMobile
                  ? '/media/fake-four-inc-black-hand-logo.svg'
                  : '/media/fake-four-inc-black-stardust-hand-logo.svg'
              }
              width={56}
            />
          </Link>
          {isMobile && (
            <Image
              alt="Fake Four Inc. Words"
              className="w-[300px] ml-1.5"
              height={72}
              priority
              src="/media/fake-four-inc-words.png"
              width={300}
            />
          )}
        </header>
      </div>
    </div>
  );
};

export default Header;
