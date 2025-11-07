// ==========================================
// DEMO PAGE - MOBILE-FIRST PLAYERS
// Next.js 15 App Router
// ==========================================

// app/page.tsx
'use client';

import { useState } from 'react';

import {
  MobileCardPlayer,
  FullScreenMobilePlayer,
  CompactMobilePlayer,
  SwipeableMobilePlayer,
  MinimalMobilePlayer,
  BottomSheetPlayer,
  StoryStylePlayer,
  ResponsiveGridPlayer,
} from '@/components/ui/audio/mobile-first-players';

export default function MobilePlayersDemo() {
  const [selectedPlayer, setSelectedPlayer] = useState('card');

  // Sample track data - replace with your actual audio
  const sampleTrack = {
    audioSrc:
      '/media/ceschi/mp3s/Ceschi - Bring Us The Head Of Francisco False (Part 1) - 03 We Are Enough (produced by Danny T Levin).mp3',
    albumArt: '/media/ceschi/we-are-enough.jpg',
    songTitle: 'we are enough',
    artist: 'The Sonic Waves',
    album: 'Echoes of Tomorrow',
  };

  const players = [
    { id: 'card', name: 'Mobile Card', component: MobileCardPlayer },
    { id: 'fullscreen', name: 'Full Screen', component: FullScreenMobilePlayer },
    { id: 'compact', name: 'Compact', component: CompactMobilePlayer },
    { id: 'swipeable', name: 'Swipeable', component: SwipeableMobilePlayer },
    { id: 'minimal', name: 'Minimal', component: MinimalMobilePlayer },
    { id: 'bottomsheet', name: 'Bottom Sheet', component: BottomSheetPlayer },
    { id: 'story', name: 'Story Style', component: StoryStylePlayer },
    { id: 'grid', name: 'Responsive Grid', component: ResponsiveGridPlayer },
  ];

  const SelectedComponent =
    players.find((p) => p.id === selectedPlayer)?.component || MobileCardPlayer;

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Mobile Navigation */}
        <div className="sticky top-0 z-30 bg-white border-b border-gray-200">
          <div className="px-4 py-3">
            <h1 className="text-xl font-semibold text-gray-900 mb-3">Mobile-First Players</h1>

            {/* Player Selector - Horizontal Scroll on Mobile */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {players.map((player) => (
                <button
                  key={player.id}
                  onClick={() => setSelectedPlayer(player.id)}
                  className={`
                    px-4 py-2 rounded-full whitespace-nowrap text-lg font-medium transition-colors
                    ${
                      selectedPlayer === player.id
                        ? 'bg-zinc-900 text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }
                  `}
                >
                  {player.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Player Container */}
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Full Screen Player takes entire viewport */}
          {selectedPlayer === 'fullscreen' ? (
            <div className="fixed inset-0 z-20 bg-white">
              <SelectedComponent {...sampleTrack} />
            </div>
          ) : selectedPlayer === 'bottomsheet' ? (
            // Bottom Sheet needs full page context
            <SelectedComponent {...sampleTrack} />
          ) : (
            // Other players in container
            <div className="max-w-2xl mx-auto">
              <SelectedComponent {...sampleTrack} />
            </div>
          )}
        </div>

        {/* Info Section */}
        {selectedPlayer !== 'fullscreen' && selectedPlayer !== 'bottomsheet' && (
          <div className="px-4 pb-8 max-w-2xl mx-auto">
            <div className="mt-8 p-4 bg-white rounded-lg border border-gray-200">
              <h2 className="text-lg font-medium text-gray-900 mb-2">Player Features</h2>
              <ul className="space-y-2 text-sm text-gray-600">
                {selectedPlayer === 'card' && (
                  <>
                    <li>• Responsive card layout</li>
                    <li>• Clean metadata display</li>
                    <li>• Full Video.js controls</li>
                    <li>• Touch-optimized</li>
                  </>
                )}
                {selectedPlayer === 'compact' && (
                  <>
                    <li>• Minimal space usage</li>
                    <li>• Essential controls only</li>
                    <li>• Perfect for lists</li>
                    <li>• Fast loading</li>
                  </>
                )}
                {selectedPlayer === 'swipeable' && (
                  <>
                    <li>• Swipe gestures support</li>
                    <li>• Touch-friendly interface</li>
                    <li>• Next/Previous track ready</li>
                    <li>• Mobile gesture hints</li>
                  </>
                )}
                {selectedPlayer === 'minimal' && (
                  <>
                    <li>• Ultra-clean design</li>
                    <li>• Focus on content</li>
                    <li>• Distraction-free</li>
                    <li>• Maximum simplicity</li>
                  </>
                )}
                {selectedPlayer === 'story' && (
                  <>
                    <li>• Instagram-style layout</li>
                    <li>• Vertical aspect ratio</li>
                    <li>• Immersive experience</li>
                    <li>• Social media ready</li>
                  </>
                )}
                {selectedPlayer === 'grid' && (
                  <>
                    <li>• Flexible grid system</li>
                    <li>• Adapts to container</li>
                    <li>• Perfect for playlists</li>
                    <li>• Responsive scaling</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ==========================================
// app/layout.tsx
// ==========================================
/*
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import 'video.js/dist/video-js.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Mobile-First Audio Players',
  description: 'Clean, elegant audio players optimized for mobile devices',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
*/

// ==========================================
// app/globals.css additions
// ==========================================
/*
@tailwind base;
@tailwind components;
@tailwind utilities;

// Hide scrollbar for player selector
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}

// Ensure touch scrolling is smooth
.touch-pan-y {
  touch-action: pan-y;
}

// Prevent text selection on mobile
.select-none {
  -webkit-user-select: none;
  user-select: none;
}

// Video.js Mobile Optimizations
.video-js .vjs-control-bar {
  height: 48px !important;
}

.video-js button {
  outline: none !important;
}

.video-js .vjs-play-control .vjs-icon-placeholder:before {
  font-size: 2em;
}

// Ensure controls are always visible on mobile
.video-js.vjs-has-started .vjs-control-bar {
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
}

// Remove desktop hover states on mobile
@media (hover: none) {
  .video-js:hover .vjs-control-bar {
    display: flex;
    visibility: visible;
    opacity: 1;
  }
}

// iOS-specific fixes
@supports (-webkit-touch-callout: none) {
  .video-js {
    -webkit-tap-highlight-color: transparent;
  }

  .video-js button {
    -webkit-tap-highlight-color: transparent;
  }
}
*/

// ==========================================
// IMPLEMENTATION NOTES
// ==========================================
/*
## Mobile-First Design Principles:

1. **Touch Targets**: All interactive elements are at least 44x44px (iOS) or 48x48px (Android)
2. **Responsive**: Players adapt from 320px to tablet/desktop sizes
3. **Performance**: Optimized for mobile networks and processors
4. **Gestures**: Support for swipe, tap, and native mobile interactions
5. **Accessibility**: Large text, high contrast, clear visual hierarchy

## Player Types:

### Mobile Card Player
- Standard mobile player with card design
- Best for feed/list views
- Balanced metadata and controls

### Full Screen Player
- Takes entire viewport
- Immersive experience
- Sticky header/footer pattern

### Compact Player
- Minimal height
- For space-constrained layouts
- Essential controls only

### Swipeable Player
- Gesture support for track navigation
- Touch-optimized
- Visual swipe hints

### Minimal Player
- Ultra-clean design
- Maximum focus on album art
- Reduced visual noise

### Bottom Sheet Player
- Expandable/collapsible
- Background playback
- Mini player mode

### Story Style Player
- Vertical format (9:16)
- Social media optimized
- Instagram/TikTok style

### Responsive Grid Player
- Flexible container
- Works in any grid system
- Adapts to parent size

## Responsive Breakpoints:

- Mobile: 320px - 639px
- Tablet: 640px - 1023px
- Desktop: 1024px+

## Performance Tips:

1. Lazy load album artwork:
```tsx
<img
  loading="lazy"
  src={albumArt}
  alt={album}
/>
```

2. Preload audio metadata only:
```tsx
preload: 'metadata'
```

3. Use srcset for responsive images:
```tsx
<img
  srcSet={`
    ${albumArtSmall} 400w,
    ${albumArtMedium} 800w,
    ${albumArtLarge} 1200w
  `}
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
/>
```

## Accessibility:

- ARIA labels for all controls
- Keyboard navigation support
- Focus indicators
- Screen reader friendly
- High contrast support

## PWA Ready:

Add to manifest.json:
```json
{
  "name": "Mobile Audio Player",
  "short_name": "Audio",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#000000",
  "background_color": "#ffffff"
}
```

## iOS Web App:
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
```
*/
