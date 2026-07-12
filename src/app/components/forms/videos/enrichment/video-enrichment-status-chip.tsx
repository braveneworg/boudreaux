/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Badge } from '@/app/components/ui/badge';
import type { VideoEnrichmentStatusResult } from '@/lib/validation/video-enrichment-schema';

type EnrichmentStatus = VideoEnrichmentStatusResult['status'];
type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

interface VideoEnrichmentStatusChipProps {
  /** Current job status; null = never enriched. */
  status: EnrichmentStatus;
}

/** Maps (not index-access records) so variable-keyed lookups stay lint-clean. */
const CHIP_LABELS = new Map<EnrichmentStatus, string>([
  [null, 'Not enriched'],
  ['pending', 'Enriching…'],
  ['processing', 'Enriching…'],
  ['failed', 'Failed'],
  ['succeeded', 'Enriched'],
]);

const CHIP_VARIANTS = new Map<EnrichmentStatus, BadgeVariant>([
  [null, 'secondary'],
  ['pending', 'secondary'],
  ['processing', 'secondary'],
  ['failed', 'destructive'],
  ['succeeded', 'default'],
]);

/** Compact text badge reflecting the enrichment job lifecycle. */
export const VideoEnrichmentStatusChip = ({
  status,
}: VideoEnrichmentStatusChipProps): React.ReactElement => (
  <Badge
    data-testid="video-enrichment-status-chip"
    variant={CHIP_VARIANTS.get(status) ?? 'secondary'}
  >
    {CHIP_LABELS.get(status) ?? 'Not enriched'}
  </Badge>
);
