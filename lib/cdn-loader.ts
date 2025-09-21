'use client'; // Required for custom loader files in App Router

export default function loader({ src, width, quality }: { src: string; width: number; quality?: number }) {
  return `https://${process.env.NEXT_APP_CDN_DOMAIN}/public/${src}?w=${width}&q=${quality || 75}`;
}
