/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Image from 'next/image';

import { useHydrated } from '@/hooks/use-hydrated';

import { useSparklingParticles } from './_hooks/use-sparkling-particles';

/**
 * The particle texture behind the masthead below `xl`. The footer and the
 * mobile nav backdrop paint the same SVG as a CSS background from this exact
 * app-origin path, so the image uses it verbatim (`unoptimized`, no CDN
 * prefix): one URL, one fetch. A CDN-prefixed src would have the browser
 * download the 77 KiB file a second time for the footer.
 */
const MOBILE_PARTICLES_SRC = '/media/particles-6.svg';

/**
 * Decorative animated layer behind the header: a black base, the particle
 * texture below `xl` or the starfield tile at `xl`, and the sparkle overlay.
 */
const HeaderBackdrop = () => {
  const { sparkles, extinguishParticles } = useSparklingParticles();
  // The texture mounts after hydration. Lighthouse's simulated LCP counts
  // every request that starts before the observed paint, and the 77 KiB SVG
  // was the heaviest of them; the black base paints first either way (the
  // texture always arrived after first paint), it now just queues behind the
  // hero banner, stylesheet and scripts instead of beside them.
  const hydrated = useHydrated();

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      {/* Animated background layer — mobile particles below `xl`, the desktop
          starfield tile at `xl`. Driven by viewport width (CSS), not the
          server's User-Agent guess. The black base stays at every breakpoint:
          both textures are fetched after first paint, so without it the
          masthead flashes transparent (kraft) on cold loads. */}
      <div className="header-bg-pulse absolute inset-0 bg-black before:pointer-events-none before:absolute before:inset-0 before:content-[''] xl:before:bg-[url(/media/ffinc-starfield-tile.png)] xl:before:bg-auto xl:before:bg-repeat">
        {/* The particles are an <img>, not a CSS background, so the fetch can
            be marked low priority: a background in the viewport is requested at
            high priority, and this ~77 KiB SVG was the largest asset on a
            phone's first paint, taking bandwidth from the hero banner (the
            LCP) and the stylesheet. `object-cover` reproduces the old
            `bg-cover bg-center`; eager loading still starts it at render. */}
        {hydrated ? (
          <Image
            src={MOBILE_PARTICLES_SRC}
            unoptimized
            alt=""
            fill
            sizes="100vw"
            loading="eager"
            fetchPriority="low"
            className="pointer-events-none absolute inset-0 object-cover xl:hidden"
          />
        ) : null}
      </div>
      {/* Sparkle overlay */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {/* Main sparkles */}
        {sparkles.map((sparkle) => (
          <span
            className="header-sparkle absolute h-1 w-1 rounded-full bg-zinc-50"
            key={sparkle.id}
            style={{
              left: `${sparkle.left}%`,
              top: `${sparkle.top}%`,
              animationDelay: `${sparkle.delay}s`,
              animationDuration: `${sparkle.duration}s`,
            }}
          />
        ))}
        {/* Extinguishing particles */}
        {extinguishParticles.map((particle) => (
          <span
            className="header-extinguish absolute h-0.5 w-0.5 rounded-full bg-orange-400"
            key={particle.id}
            style={{
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              animationDelay: `${2.5 + particle.delay}s`,
              animationDuration: `${particle.duration}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
};

export { HeaderBackdrop };
