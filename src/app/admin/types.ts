import type { ENTITIES } from '@/lib/constants';

export type AdminEntity = (typeof ENTITIES)[keyof typeof ENTITIES];
