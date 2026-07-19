/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useSparklingParticles } from './_hooks/use-sparkling-particles';

/**
 * Decorative, non-interactive backdrop for the site header: the animated
 * background layer plus the sparkle/ember overlay. Self-contained so the header
 * doesn't carry the particle wiring. Clips its own animated overflow (the
 * `header-bg-pulse` scale-up and the sparkles) inside an aria-hidden wrapper,
 * since HeaderContainer stops clipping at `xl` to let the nav drawers overhang.
 */
const HeaderBackdrop = () => {
  const { sparkles, extinguishParticles } = useSparklingParticles();

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      {/* Animated background layer — mobile particles below `xl`, the desktop
          starfield tile at `xl`. Driven by viewport width (CSS), not the
          server's User-Agent guess. The black base stays at every breakpoint:
          the starfield tile on ::before is fetched only after first paint, so
          without it the masthead flashes transparent (kraft) on cold loads. */}
      <div className="header-bg-pulse absolute inset-0 bg-black before:pointer-events-none before:absolute before:inset-0 before:bg-[url('/media/particles-6.svg')] before:bg-cover before:bg-center before:bg-no-repeat before:content-[''] xl:before:bg-[url(/media/ffinc-starfield-tile.png)] xl:before:bg-auto xl:before:bg-repeat" />
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
