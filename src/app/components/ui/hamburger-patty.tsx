'use client';

import { motion } from 'framer-motion';

export interface HamburgerPattyProps {
  /**
   * Whether the patty is in the open (X) state
   */
  isOpen?: boolean;
  /**
   * The rotation angle when open (in degrees)
   */
  rotateOpen?: number;
  /**
   * The rotation angle when closed (in degrees)
   */
  rotateClosed?: number;
  /**
   * The Y offset when closed (in pixels)
   */
  yOffset?: number;
  /**
   * The width of the patty (Tailwind class)
   */
  width?: string;
  /**
   * The height of the patty (Tailwind class)
   */
  height?: string;
  /**
   * The background color (Tailwind class)
   */
  bgColor?: string;
  /**
   * The animation duration (in seconds)
   */
  duration?: number;
  /**
   * The opacity when open (0-1)
   */
  opacityOpen?: number;
  /**
   * The opacity when closed (0-1)
   */
  opacityClosed?: number;
}

export default function HamburgerPatty({
  isOpen = false,
  rotateOpen = 45,
  rotateClosed = 0,
  yOffset = -8,
  width = 'w-8',
  height = 'h-0.5',
  bgColor = 'bg-white',
  duration = 0.3,
  opacityOpen = 1,
  opacityClosed = 1,
}: HamburgerPattyProps) {
  return (
    <motion.span
      className={`absolute ${width} ${height} ${bgColor} pointer-events-none`}
      animate={{
        rotate: isOpen ? rotateOpen : rotateClosed,
        y: isOpen ? 0 : yOffset,
        opacity: isOpen ? opacityOpen : opacityClosed,
      }}
      transition={{ duration }}
    />
  );
}
