// lucide-react ships no type declarations for its deep ESM paths. The lazy
// icon shim (src/test-utils/lazy-lucide-react.ts) imports `createLucideIcon`
// directly so a spec never has to evaluate the 1,600-icon barrel.
declare module 'lucide-react/dist/esm/createLucideIcon.js' {
  import type { IconNode, LucideIcon } from 'lucide-react';

  const createLucideIcon: (iconName: string, iconNode: IconNode) => LucideIcon;
  export default createLucideIcon;
}
