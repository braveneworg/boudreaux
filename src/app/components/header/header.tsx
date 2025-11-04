import { headers } from 'next/headers';
import Image from 'next/image';
import { userAgentFromString } from 'next/server'; // For App Router

import Logo from './logo';
import HamburgerMenu from '../ui/hamburger-menu';

const Header = async () => {
  const userAgent = (await headers()).get('user-agent') || '';
  const { device } = userAgentFromString(userAgent);
  const isMobile = device?.type === 'mobile' || device?.type === 'tablet';

  return (
    <div className="sticky top-0 left-0 right-0 z-[100] w-full bg-[url('/media/particles-4.svg')] bg-cover bg-center bg-no-repeat before:content-[''] before:absolute before:inset-0 before:opacity-90 before:pointer-events-none">
      <div className="relative mx-auto w-full max-w-[1920px] px-1 pb-1.5 md:px-8 overflow-hidden">
        <header className="flex items-center justify-between md:h-[144px] w-full min-w-0">
          <Logo isMobile={isMobile} />
          {isMobile && (
            <>
              <Image
                alt="Fake Four Inc. Words"
                className="relative right-1 w-[300px] h-[56px]"
                height={56}
                priority
                src="/media/fake-four-inc-words.png"
                width={300}
              />
              <HamburgerMenu />
            </>
          )}
        </header>
      </div>
    </div>
  );
};

export default Header;
