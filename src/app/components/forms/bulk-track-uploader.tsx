/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState, useRef } from 'react';

import { useRouter } from 'next/navigation';

import {
  Upload,
  FileAudio,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Music,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import { Checkbox } from '@/app/components/ui/checkbox';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Progress } from '@/app/components/ui/progress';
import { ScrollArea } from '@/app/components/ui/scroll-area';
import { Separator } from '@/app/components/ui/separator';
import { Switch } from '@/app/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/ui/table';
import {
  bulkCreateTracksAction,
  type BulkTrackData,
  type BulkTrackResult,
} from '@/lib/actions/bulk-create-tracks-action';
import {
  checkDuplicateTracksAction,
  type ExistingTrackInfo,
} from '@/lib/actions/check-duplicate-tracks-action';
import { getPresignedUploadUrlsAction } from '@/lib/actions/presigned-upload-actions';
import {
  updateTrackAudioAction,
  markTrackUploadingAction,
} from '@/lib/actions/update-track-audio-action';
import type { AudioMetadata } from '@/lib/services/audio-metadata-service';
import { cn } from '@/lib/utils';
import { uploadCoverArtsToS3 } from '@/lib/utils/cover-art-upload';
import { uploadFilesToS3 } from '@/lib/utils/direct-upload';

import { BreadcrumbMenu } from '../ui/breadcrumb-menu';
import { TrackPlayButton } from '../ui/track-play-button';

/**
 * Supported audio file types for bulk upload
 */
const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/aiff',
  'audio/x-aiff',
  'audio/flac',
  'audio/x-flac',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'audio/m4a',
  'audio/x-m4a',
];

/**
 * Represents a track being uploaded in bulk
 */
interface BulkTrackItem {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  status:
    | 'pending'
    | 'extracting'
    | 'extracted'
    | 'uploading'
    | 'uploaded'
    | 'creating'
    | 'success'
    | 'error'
    | 'queued' // For deferred upload - waiting for background upload
    | 'background_uploading'; // For deferred upload - uploading in background
  progress: number;
  error?: string;
  metadata?: AudioMetadata;
  uploadedUrl?: string;
  trackId?: string;
  releaseId?: string;
  releaseTitle?: string;
  releaseCreated?: boolean;
  // Editable fields
  title: string;
  position: number;
  /** Whether this track was identified as a duplicate of an existing DB record */
  isDuplicate?: boolean;
  /** Info about the existing track in the database (set when isDuplicate is true) */
  existingTrackInfo?: ExistingTrackInfo;
}

/**
 * Format file size for display
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 */
const formatDuration = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return '--:--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

/**
 * Generate a unique ID
 */
const generateId = (): string => {
  return `track-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Process items in batches with concurrency limit
 * This allows parallel processing while avoiding overwhelming the server
 */
const processInBatches = async <T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency = 3
): Promise<R[]> => {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
  }

  return results;
};

export default function BulkTrackUploader() {
  const [tracks, setTracks] = useState<BulkTrackItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoCreateRelease, setAutoCreateRelease] = useState(true);
  const [publishTracks, setPublishTracks] = useState(true);
  const [deferUpload, setDeferUpload] = useState(false);
  const [backgroundUploading, setBackgroundUploading] = useState(false);
  const [_results, setResults] = useState<BulkTrackResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  /**
   * Extract metadata from a single file
   */
  const extractMetadata = useCallback(async (file: File): Promise<AudioMetadata | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/tracks/metadata', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        console.warn('Metadata extraction failed for', file.name);
        return null;
      }

      const result = await response.json();
      return result.metadata;
    } catch (err) {
      console.warn('Error extracting metadata:', err);
      return null;
    }
  }, []);

  /**
   * Process files from input or drag and drop
   */
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      // Filter for supported audio files
      const audioFiles = Array.from(files).filter((file) =>
        SUPPORTED_AUDIO_TYPES.includes(file.type)
      );

      if (audioFiles.length === 0) {
        toast.error('No supported audio files selected');
        return;
      }

      if (audioFiles.length !== files.length) {
        toast.warning(`${files.length - audioFiles.length} unsupported file(s) were skipped`);
      }

      // Create track items
      const newTracks: BulkTrackItem[] = audioFiles.map((file, index) => ({
        id: generateId(),
        file,
        fileName: file.name,
        fileSize: file.size,
        status: 'pending' as const,
        progress: 0,
        title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
        position: tracks.length + index + 1,
      }));

      setTracks((prev) => [...prev, ...newTracks]);

      // Mark all tracks as extracting
      setTracks((prev) =>
        prev.map((t) =>
          newTracks.some((nt) => nt.id === t.id) ? { ...t, status: 'extracting' as const } : t
        )
      );

      // Extract metadata in parallel batches (3 concurrent extractions)
      // This significantly speeds up bulk uploads while not overwhelming the server
      const CONCURRENCY_LIMIT = 3;
      const extractedHashes: { trackId: string; hash: string }[] = [];

      await processInBatches(
        newTracks,
        async (track) => {
          const metadata = await extractMetadata(track.file);

          if (metadata?.audioFileHash) {
            extractedHashes.push({ trackId: track.id, hash: metadata.audioFileHash });
          }

          setTracks((prev) =>
            prev.map((t) =>
              t.id === track.id
                ? {
                    ...t,
                    status: 'extracted' as const,
                    metadata: metadata ?? undefined,
                    title: metadata?.title || t.title,
                    position: metadata?.trackNumber || t.position,
                  }
                : t
            )
          );

          return metadata;
        },
        CONCURRENCY_LIMIT
      );

      // Check for duplicate tracks in the database by SHA-256 hash
      if (extractedHashes.length > 0) {
        const hashes = extractedHashes.map((e) => e.hash);
        const dupeResult = await checkDuplicateTracksAction(hashes);

        if (dupeResult.success && dupeResult.duplicates.length > 0) {
          const dupeMap = new Map(dupeResult.duplicates.map((d) => [d.audioFileHash, d]));

          setTracks((prev) =>
            prev.map((t) => {
              const hash = t.metadata?.audioFileHash;
              if (hash && dupeMap.has(hash)) {
                return { ...t, isDuplicate: true, existingTrackInfo: dupeMap.get(hash) };
              }
              return t;
            })
          );

          const dupeCount = dupeResult.duplicates.length;
          toast.info(
            `${dupeCount} file${dupeCount !== 1 ? 's' : ''} already exist in the database. ` +
              `They will be re-uploaded to S3 but not duplicated in the database.`
          );
        }
      }

      // Clear the input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [tracks.length, extractMetadata]
  );

  /**
   * Handle file input change
   */
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(event.target.files);
    },
    [handleFiles]
  );

  /**
   * Handle drag over event
   */
  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  }, []);

  /**
   * Handle drag leave event
   */
  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  }, []);

  /**
   * Handle drop event
   */
  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);
      handleFiles(event.dataTransfer.files);
    },
    [handleFiles]
  );

  /**
   * Remove a track from the list
   */
  const removeTrack = useCallback((trackId: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
  }, []);

  /**
   * Clear all tracks
   */
  const clearAll = useCallback(() => {
    setTracks([]);
    setResults([]);
    setShowResults(false);
  }, []);

  /**
   * Update track title
   */
  const updateTrackTitle = useCallback((trackId: string, title: string) => {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, title } : t)));
  }, []);

  /**
   * Update track position
   */
  const updateTrackPosition = useCallback((trackId: string, position: number) => {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, position } : t)));
  }, []);

  /**
   * Start background uploads for tracks with PENDING status
   * This uploads files to S3 and updates track records with the CDN URL
   */
  const startBackgroundUploads = useCallback(async (tracksToUpload: BulkTrackItem[]) => {
    if (tracksToUpload.length === 0) return;

    setBackgroundUploading(true);

    // Track successes locally since React state updates are async
    let localSuccessCount = 0;

    try {
      // Process uploads one at a time to avoid overwhelming the server
      for (const track of tracksToUpload) {
        if (!track.trackId) continue;

        try {
          // Mark track as uploading
          setTracks((prev) =>
            prev.map((t) =>
              t.id === track.id ? { ...t, status: 'background_uploading' as const } : t
            )
          );

          // Only mark as uploading in DB for new tracks (not duplicates)
          if (!track.isDuplicate) {
            await markTrackUploadingAction(track.trackId);
          }

          // Get presigned URL for this file
          // For duplicates, use the existing S3 key to overwrite the same object
          const fileInfo = {
            fileName: track.file.name,
            contentType: track.file.type,
            fileSize: track.file.size,
            ...(track.isDuplicate && track.existingTrackInfo?.existingS3Key
              ? { existingS3Key: track.existingTrackInfo.existingS3Key }
              : {}),
          };

          const presignedResult = await getPresignedUploadUrlsAction('tracks', 'single', [
            fileInfo,
          ]);

          if (!presignedResult.success || !presignedResult.data?.[0]) {
            throw new Error(presignedResult.error || 'Failed to get upload URL');
          }

          // Upload file to S3
          const uploadResults = await uploadFilesToS3([track.file], presignedResult.data);

          if (!uploadResults[0]?.success) {
            throw new Error('Upload failed');
          }

          const cdnUrl = presignedResult.data[0].cdnUrl;

          if (track.isDuplicate) {
            // For duplicates: only update audioUrl in DB if the path changed
            const existingAudioUrl = track.existingTrackInfo?.audioUrl;
            if (cdnUrl !== existingAudioUrl) {
              const updateResult = await updateTrackAudioAction(track.trackId, cdnUrl, 'COMPLETED');

              if (!updateResult.success) {
                console.warn(
                  `[Background Upload] Failed to update audioUrl for duplicate ${track.trackId}:`,
                  updateResult.error
                );
              }
            }
          } else {
            // For new tracks: always update (existing behavior)
            const updateResult = await updateTrackAudioAction(track.trackId, cdnUrl, 'COMPLETED');

            if (!updateResult.success) {
              throw new Error(updateResult.error || 'Failed to update track');
            }
          }

          // Update local state
          setTracks((prev) =>
            prev.map((t) =>
              t.id === track.id
                ? {
                    ...t,
                    status: 'success' as const,
                    uploadedUrl: cdnUrl,
                  }
                : t
            )
          );

          // Track success locally
          localSuccessCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Background upload failed';

          // Mark track as failed (only update DB for new tracks)
          if (track.trackId && !track.isDuplicate) {
            await updateTrackAudioAction(track.trackId, '', 'FAILED', errorMessage);
          }

          setTracks((prev) =>
            prev.map((t) =>
              t.id === track.id ? { ...t, status: 'error' as const, error: errorMessage } : t
            )
          );
        }
      }

      if (localSuccessCount === tracksToUpload.length) {
        toast.success('All background uploads completed successfully');
      } else if (localSuccessCount > 0) {
        toast.warning(`${localSuccessCount} of ${tracksToUpload.length} uploads completed`);
      } else {
        toast.error('All background uploads failed');
      }
    } finally {
      setBackgroundUploading(false);
    }
  }, []);

  /**
   * Process all tracks - upload and create
   */
  const processAllTracks = useCallback(async () => {
    if (tracks.length === 0) {
      toast.error('No tracks to upload');
      return;
    }

    setIsProcessing(true);
    setShowResults(false);

    try {
      const filesToUpload = tracks.filter((t) => t.status === 'extracted');

      if (filesToUpload.length === 0) {
        toast.error('No tracks ready for upload');
        setIsProcessing(false);
        return;
      }

      // Deferred upload mode - create tracks first, upload later in background
      if (deferUpload) {
        // Separate files into new tracks and duplicates
        const newFilesToUpload = filesToUpload.filter((t) => !t.isDuplicate);
        const duplicateFilesToUpload = filesToUpload.filter((t) => t.isDuplicate);

        // Update status to creating for new tracks only
        if (newFilesToUpload.length > 0) {
          setTracks((prev) =>
            prev.map((t) =>
              newFilesToUpload.some((f) => f.id === t.id)
                ? { ...t, status: 'creating' as const }
                : t
            )
          );
        }

        // Upload base64 cover art to S3 first (only for new tracks)
        console.info('[Bulk Upload Deferred] Checking for base64 cover arts:', {
          totalTracks: newFilesToUpload.length,
          tracksWithMetadata: newFilesToUpload.filter((t) => t.metadata).length,
          tracksWithCoverArt: newFilesToUpload.filter((t) => t.metadata?.coverArt).length,
          tracksWithBase64CoverArt: newFilesToUpload.filter((t) =>
            t.metadata?.coverArt?.startsWith('data:')
          ).length,
        });
        const base64CoverArts = newFilesToUpload
          .filter((track) => track.metadata?.coverArt?.startsWith('data:'))
          .map((track) => ({
            base64: track.metadata!.coverArt!,
            albumName: track.metadata?.album,
          }));

        let albumToCdnUrl = new Map<string, string>();
        if (base64CoverArts.length > 0) {
          toast.info(`Uploading ${base64CoverArts.length} cover art image(s)...`);
          albumToCdnUrl = await uploadCoverArtsToS3(base64CoverArts);
        }

        const tracksForBackgroundUpload: BulkTrackItem[] = [];

        // Create DB records only for new tracks
        if (newFilesToUpload.length > 0) {
          // Create track data with uploaded cover art URLs
          const trackData: BulkTrackData[] = newFilesToUpload.map((track) => {
            const coverArt = track.metadata?.coverArt;
            let coverArtUrl: string | undefined;

            if (coverArt) {
              if (coverArt.startsWith('data:')) {
                // Use uploaded CDN URL for base64 cover art
                const albumKey = (track.metadata?.album || '').toLowerCase().trim();
                coverArtUrl = albumToCdnUrl.get(albumKey);
              } else {
                // Use existing URL as-is
                coverArtUrl = coverArt;
              }
            }

            return {
              title: track.title,
              duration: track.metadata?.duration || 0,
              position: track.position,
              audioFileHash: track.metadata?.audioFileHash,
              coverArt: coverArtUrl,
              album: track.metadata?.album,
              year: track.metadata?.year,
              date: track.metadata?.date,
              label: track.metadata?.label,
              catalogNumber: track.metadata?.catalogNumber,
              albumArtist: track.metadata?.albumArtist,
              artist: track.metadata?.artist,
              lossless: track.metadata?.lossless,
            };
          });

          // Debug: Log trackData size before sending to server action
          const trackDataJson = JSON.stringify(trackData);
          console.info('[Bulk Upload Deferred] Track data size before server action:', {
            trackCount: trackData.length,
            jsonSizeBytes: trackDataJson.length,
            jsonSizeMB: (trackDataJson.length / (1024 * 1024)).toFixed(2),
            hasCoverArtData: trackData.some((t) => t.coverArt?.startsWith('data:')),
          });

          const createResult = await bulkCreateTracksAction(trackData, {
            autoCreateRelease,
            publishTracks,
            deferUpload: true,
          });

          // Update new tracks with create results and queue for background upload
          for (const result of createResult.results) {
            const track = newFilesToUpload[result.index];
            if (!track) continue;

            if (result.success && result.trackId) {
              const updatedTrack = {
                ...track,
                status: 'queued' as const,
                trackId: result.trackId,
                releaseId: result.releaseId,
                releaseTitle: result.releaseTitle,
                releaseCreated: result.releaseCreated,
              };
              tracksForBackgroundUpload.push(updatedTrack);

              setTracks((prev) => prev.map((t) => (t.id === track.id ? updatedTrack : t)));
            } else {
              setTracks((prev) =>
                prev.map((t) =>
                  t.id === track.id
                    ? {
                        ...t,
                        status: 'error' as const,
                        error: result.error || 'Failed to create track',
                      }
                    : t
                )
              );
            }
          }

          setResults(createResult.results);
        }

        // Queue duplicate tracks for background upload (they already have trackIds)
        for (const track of duplicateFilesToUpload) {
          const updatedTrack = {
            ...track,
            status: 'queued' as const,
            trackId: track.existingTrackInfo?.trackId,
          };
          tracksForBackgroundUpload.push(updatedTrack);
          setTracks((prev) => prev.map((t) => (t.id === track.id ? updatedTrack : t)));
        }

        setShowResults(true);

        const newCreatedCount = tracksForBackgroundUpload.filter((t) => !t.isDuplicate).length;
        const dupeQueuedCount = duplicateFilesToUpload.length;

        if (tracksForBackgroundUpload.length > 0) {
          if (newCreatedCount > 0 && dupeQueuedCount > 0) {
            toast.success(
              `Created ${newCreatedCount} track(s). ${dupeQueuedCount} duplicate(s) queued for S3 re-upload. Starting background uploads...`
            );
          } else if (newCreatedCount > 0) {
            toast.success(`Created ${newCreatedCount} track(s). Starting background uploads...`);
          } else if (dupeQueuedCount > 0) {
            toast.success(
              `${dupeQueuedCount} duplicate(s) queued for S3 re-upload. Starting background uploads...`
            );
          }

          // Start background upload process
          setIsProcessing(false);
          startBackgroundUploads(tracksForBackgroundUpload);
        } else {
          toast.error('No tracks to upload');
        }

        return;
      }

      // Standard mode - upload first, then create tracks
      // Update status to uploading
      setTracks((prev) =>
        prev.map((t) =>
          filesToUpload.some((f) => f.id === t.id)
            ? { ...t, status: 'uploading' as const, progress: 0 }
            : t
        )
      );

      // Get presigned URLs for all files
      // Duplicates get the existing S3 key for overwriting the same object
      const fileInfos = filesToUpload.map((track) => ({
        fileName: track.file.name,
        contentType: track.file.type,
        fileSize: track.file.size,
        ...(track.isDuplicate && track.existingTrackInfo?.existingS3Key
          ? { existingS3Key: track.existingTrackInfo.existingS3Key }
          : {}),
      }));

      const presignedResult = await getPresignedUploadUrlsAction('tracks', 'bulk', fileInfos);

      if (!presignedResult.success || !presignedResult.data) {
        throw new Error(presignedResult.error || 'Failed to get upload URLs');
      }

      // Upload files to S3
      const files = filesToUpload.map((t) => t.file);
      const uploadResults = await uploadFilesToS3(files, presignedResult.data);

      // Update tracks with upload results
      const uploadedTracks: BulkTrackItem[] = [];
      for (let i = 0; i < filesToUpload.length; i++) {
        const track = filesToUpload[i];
        const uploadResult = uploadResults[i];
        const presignedInfo = presignedResult.data[i];

        if (uploadResult.success) {
          const updatedTrack = {
            ...track,
            status: 'uploaded' as const,
            progress: 100,
            uploadedUrl: presignedInfo.cdnUrl,
          };
          uploadedTracks.push(updatedTrack);

          setTracks((prev) => prev.map((t) => (t.id === track.id ? updatedTrack : t)));
        } else {
          setTracks((prev) =>
            prev.map((t) =>
              t.id === track.id ? { ...t, status: 'error' as const, error: 'Upload failed' } : t
            )
          );
        }
      }

      if (uploadedTracks.length === 0) {
        throw new Error('All file uploads failed');
      }

      // Separate uploaded tracks into new tracks and duplicates
      const newUploadedTracks = uploadedTracks.filter((t) => !t.isDuplicate);
      const duplicateUploadedTracks = uploadedTracks.filter((t) => t.isDuplicate);

      // Step 2: Create tracks in database (only for new tracks)
      let createResult: Awaited<ReturnType<typeof bulkCreateTracksAction>> | null = null;
      if (newUploadedTracks.length > 0) {
        setTracks((prev) =>
          prev.map((t) =>
            newUploadedTracks.some((u) => u.id === t.id) ? { ...t, status: 'creating' as const } : t
          )
        );

        // Upload base64 cover art to S3 first
        console.info('[Bulk Upload] Checking for base64 cover arts:', {
          totalTracks: newUploadedTracks.length,
          tracksWithMetadata: newUploadedTracks.filter((t) => t.metadata).length,
          tracksWithCoverArt: newUploadedTracks.filter((t) => t.metadata?.coverArt).length,
          tracksWithBase64CoverArt: newUploadedTracks.filter((t) =>
            t.metadata?.coverArt?.startsWith('data:')
          ).length,
        });
        const base64CoverArts = newUploadedTracks
          .filter((track) => track.metadata?.coverArt?.startsWith('data:'))
          .map((track) => ({
            base64: track.metadata!.coverArt!,
            albumName: track.metadata?.album,
          }));

        let albumToCdnUrl = new Map<string, string>();
        if (base64CoverArts.length > 0) {
          toast.info(`Uploading ${base64CoverArts.length} cover art image(s)...`);
          albumToCdnUrl = await uploadCoverArtsToS3(base64CoverArts);
        }

        // Create track data with uploaded cover art URLs
        const trackData: BulkTrackData[] = newUploadedTracks.map((track) => {
          const coverArt = track.metadata?.coverArt;
          let coverArtUrl: string | undefined;

          if (coverArt) {
            if (coverArt.startsWith('data:')) {
              // Use uploaded CDN URL for base64 cover art
              const albumKey = (track.metadata?.album || '').toLowerCase().trim();
              coverArtUrl = albumToCdnUrl.get(albumKey);
            } else {
              // Use existing URL as-is
              coverArtUrl = coverArt;
            }
          }

          return {
            title: track.title,
            duration: track.metadata?.duration || 0,
            audioUrl: track.uploadedUrl!,
            position: track.position,
            audioFileHash: track.metadata?.audioFileHash,
            coverArt: coverArtUrl,
            album: track.metadata?.album,
            year: track.metadata?.year,
            date: track.metadata?.date,
            label: track.metadata?.label,
            catalogNumber: track.metadata?.catalogNumber,
            albumArtist: track.metadata?.albumArtist,
            artist: track.metadata?.artist,
            lossless: track.metadata?.lossless,
          };
        });

        // Debug: Log trackData size before sending to server action
        const trackDataJson = JSON.stringify(trackData);
        console.info('[Bulk Upload] Track data size before server action:', {
          trackCount: trackData.length,
          jsonSizeBytes: trackDataJson.length,
          jsonSizeMB: (trackDataJson.length / (1024 * 1024)).toFixed(2),
          hasCoverArtData: trackData.some((t) => t.coverArt?.startsWith('data:')),
        });

        createResult = await bulkCreateTracksAction(trackData, {
          autoCreateRelease,
          publishTracks,
        });

        // Update tracks with create results
        for (const result of createResult.results) {
          const track = newUploadedTracks[result.index];
          if (!track) continue;

          setTracks((prev) =>
            prev.map((t) =>
              t.id === track.id
                ? {
                    ...t,
                    status: result.success ? ('success' as const) : ('error' as const),
                    error: result.error,
                    trackId: result.trackId,
                    releaseId: result.releaseId,
                    releaseTitle: result.releaseTitle,
                    releaseCreated: result.releaseCreated,
                  }
                : t
            )
          );
        }

        setResults(createResult.results);
        setShowResults(true);
      }

      // Handle duplicate tracks: update audioUrl in DB if the S3 path changed
      for (const track of duplicateUploadedTracks) {
        const existingInfo = track.existingTrackInfo;
        if (!existingInfo) continue;

        const newCdnUrl = track.uploadedUrl;
        const existingAudioUrl = existingInfo.audioUrl;

        // If the new CDN URL differs from what's stored (e.g., was pending://upload),
        // update the track's audioUrl in the database
        if (newCdnUrl && newCdnUrl !== existingAudioUrl) {
          try {
            const updateResult = await updateTrackAudioAction(
              existingInfo.trackId,
              newCdnUrl,
              'COMPLETED'
            );

            if (!updateResult.success) {
              console.warn(
                `[Bulk Upload] Failed to update audioUrl for duplicate track ${existingInfo.trackId}:`,
                updateResult.error
              );
            }
          } catch (err) {
            console.warn('[Bulk Upload] Error updating duplicate track audioUrl:', err);
          }
        }

        // Mark duplicate as success in the UI
        setTracks((prev) =>
          prev.map((t) =>
            t.id === track.id
              ? {
                  ...t,
                  status: 'success' as const,
                  trackId: existingInfo.trackId,
                }
              : t
          )
        );
      }

      setShowResults(true);

      // Show appropriate toast messages
      const newCount = newUploadedTracks.length;
      const dupeCount = duplicateUploadedTracks.length;

      // Check if track creation had failures
      if (createResult && !createResult.success) {
        if (createResult.error) {
          toast.error(`Failed to create tracks: ${createResult.error}`);
        } else if (createResult.successCount > 0) {
          toast.warning(
            `Created ${createResult.successCount} track(s), ${createResult.failedCount} failed`
          );
        } else {
          toast.error('Failed to create tracks');
        }
      } else if (newCount > 0 && dupeCount > 0) {
        toast.success(
          `Created ${newCount} new track(s). ${dupeCount} duplicate(s) re-uploaded to S3.`
        );
      } else if (newCount > 0) {
        toast.success(`Successfully created ${newCount} track(s)`);
      } else if (dupeCount > 0) {
        toast.success(`${dupeCount} duplicate(s) re-uploaded to S3. No new tracks created.`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Bulk upload failed';
      console.error('Bulk upload error:', {
        message: errorMessage,
        error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      toast.error(errorMessage);

      // Mark remaining tracks as error with the actual error message
      setTracks((prev) =>
        prev.map((t) =>
          t.status === 'uploading' || t.status === 'creating'
            ? { ...t, status: 'error' as const, error: errorMessage }
            : t
        )
      );
    } finally {
      setIsProcessing(false);
    }
  }, [tracks, autoCreateRelease, publishTracks, deferUpload, startBackgroundUploads]);

  const pendingCount = tracks.filter(
    (t) => t.status === 'pending' || t.status === 'extracting' || t.status === 'extracted'
  ).length;
  const successCount = tracks.filter((t) => t.status === 'success').length;
  const errorCount = tracks.filter((t) => t.status === 'error').length;
  const duplicateCount = tracks.filter((t) => t.isDuplicate).length;

  const getStatusIcon = (track: BulkTrackItem) => {
    const { status, isDuplicate } = track;
    switch (status) {
      case 'pending':
      case 'extracting':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case 'extracted':
        return isDuplicate ? (
          <AlertCircle className="h-4 w-4 text-amber-500" />
        ) : (
          <FileAudio className="h-4 w-4 text-blue-500" />
        );
      case 'uploading':
      case 'creating':
      case 'background_uploading':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'uploaded':
        return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
      case 'queued':
        return <Loader2 className="h-4 w-4 text-orange-500" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const _getStatusText = (status: BulkTrackItem['status']) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'extracting':
        return 'Extracting metadata...';
      case 'extracted':
        return 'Ready';
      case 'uploading':
        return 'Uploading...';
      case 'uploaded':
        return 'Uploaded';
      case 'creating':
        return 'Creating track...';
      case 'queued':
        return 'Queued for upload';
      case 'background_uploading':
        return 'Uploading in background...';
      case 'success':
        return 'Created';
      case 'error':
        return 'Failed';
    }
  };

  return (
    <div className="container mx-auto space-y-6 px-4 py-6">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Tracks', url: '/admin/tracks', isActive: false },
          { anchorText: 'Bulk Upload', url: '/admin/tracks/bulk', isActive: true },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            Bulk Track Upload
          </CardTitle>
          <CardDescription>
            Upload multiple audio files at once. Metadata will be extracted automatically and
            releases will be created or matched from album information.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* File Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="file-input">Select Audio Files</Label>
              {tracks.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearAll} disabled={isProcessing}>
                  Clear All
                </Button>
              )}
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8',
                'transition-colors hover:border-primary/50',
                isDragOver && 'border-primary bg-primary/5',
                isProcessing && 'pointer-events-none opacity-50'
              )}
            >
              <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
              <p className="mb-2 text-sm text-muted-foreground">
                Drag and drop audio files here, or click to select
              </p>
              <p className="mb-4 text-xs text-muted-foreground">
                Supports MP3, WAV, FLAC, AAC, OGG, M4A (up to 100 files)
              </p>
              <Input
                ref={fileInputRef}
                id="file-input"
                type="file"
                accept={SUPPORTED_AUDIO_TYPES.join(',')}
                multiple
                onChange={handleFileSelect}
                disabled={isProcessing}
                className="max-w-xs"
              />
            </div>
          </div>

          {/* Options */}
          {tracks.length > 0 && (
            <>
              <Separator />

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="auto-release"
                  checked={autoCreateRelease}
                  onCheckedChange={(checked) => setAutoCreateRelease(checked === true)}
                  disabled={isProcessing}
                />
                <Label
                  htmlFor="auto-release"
                  className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Automatically create or match releases from album metadata
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="publish-tracks"
                  checked={publishTracks}
                  onCheckedChange={setPublishTracks}
                  disabled={isProcessing}
                />
                <Label
                  htmlFor="publish-tracks"
                  className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Published
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="defer-upload"
                  checked={deferUpload}
                  onCheckedChange={setDeferUpload}
                  disabled={isProcessing || backgroundUploading}
                />
                <Label
                  htmlFor="defer-upload"
                  className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Background upload (create tracks first, upload audio in background)
                </Label>
              </div>
            </>
          )}

          {/* Track List */}
          {tracks.length > 0 && (
            <>
              <Separator />

              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-medium">Tracks ({tracks.length})</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {successCount > 0 && (
                      <Badge variant="default" className="bg-green-500">
                        {successCount} created
                      </Badge>
                    )}
                    {errorCount > 0 && <Badge variant="destructive">{errorCount} failed</Badge>}
                    {duplicateCount > 0 && (
                      <Badge variant="outline" className="border-amber-500 text-amber-600">
                        {duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''}
                      </Badge>
                    )}
                    {pendingCount > 0 && (
                      <Badge variant="secondary" className="animate-pulse-scale">
                        {pendingCount} pending
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Mobile Card View */}
                <ScrollArea className="h-100 rounded-md border md:hidden">
                  <div className="divide-y">
                    {tracks.map((track) => (
                      <div
                        key={track.id}
                        className={cn(
                          'space-y-3 p-4',
                          track.status === 'error' && 'bg-destructive/10',
                          track.status === 'success' && 'bg-green-500/10'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(track)}
                            {track.uploadedUrl && (
                              <TrackPlayButton audioUrl={track.uploadedUrl} size="sm" />
                            )}
                            <span className="text-sm font-medium text-muted-foreground">
                              #{track.position}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeTrack(track.id)}
                            disabled={isProcessing || track.status === 'success'}
                            className="h-8 w-8 shrink-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <Input
                            value={track.title}
                            onChange={(e) => updateTrackTitle(track.id, e.target.value)}
                            disabled={isProcessing || track.status === 'success'}
                            placeholder="Track title"
                          />
                          {track.error && (
                            <p className="flex items-center gap-1 text-xs text-destructive">
                              <AlertCircle className="h-3 w-3" />
                              {track.error}
                            </p>
                          )}
                          {track.isDuplicate && (
                            <p className="text-xs text-amber-600">
                              Duplicate of &ldquo;{track.existingTrackInfo?.title}&rdquo;
                            </p>
                          )}
                          {track.releaseTitle && (
                            <p className="text-xs text-muted-foreground">
                              Release: {track.releaseTitle}
                              {track.releaseCreated && (
                                <Badge variant="outline" className="ml-1 text-[10px]">
                                  new
                                </Badge>
                              )}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Label htmlFor={`position-${track.id}`} className="text-xs">
                              Pos:
                            </Label>
                            <Input
                              id={`position-${track.id}`}
                              type="number"
                              min={1}
                              value={track.position}
                              onChange={(e) =>
                                updateTrackPosition(track.id, parseInt(e.target.value, 10) || 1)
                              }
                              disabled={isProcessing || track.status === 'success'}
                              className="h-7 w-14"
                            />
                          </div>
                          <span>{formatDuration(track.metadata?.duration)}</span>
                          <span>{formatFileSize(track.fileSize)}</span>
                        </div>

                        {track.metadata?.album && (
                          <p className="truncate text-xs text-muted-foreground">
                            Album: {track.metadata.album}
                          </p>
                        )}
                        {track.metadata?.coverArt && (
                          <p className="truncate text-xs text-muted-foreground">
                            Cover:{' '}
                            {track.metadata.coverArt.startsWith('data:')
                              ? `[embedded image - ${Math.round(track.metadata.coverArt.length / 1024)}KB]`
                              : track.metadata.coverArt}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                {/* Desktop Table View */}
                <ScrollArea className="hidden h-100 rounded-md border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">Status</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead className="w-20">Position</TableHead>
                        <TableHead className="w-25">Duration</TableHead>
                        <TableHead>Album</TableHead>
                        <TableHead className="w-32">Cover</TableHead>
                        <TableHead className="w-25">Size</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tracks.map((track) => (
                        <TableRow
                          key={track.id}
                          className={cn(
                            track.status === 'error' && 'bg-destructive/10',
                            track.status === 'success' && 'bg-green-500/10'
                          )}
                        >
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {getStatusIcon(track)}
                              {track.uploadedUrl && (
                                <TrackPlayButton audioUrl={track.uploadedUrl} size="sm" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Input
                                value={track.title}
                                onChange={(e) => updateTrackTitle(track.id, e.target.value)}
                                disabled={isProcessing || track.status === 'success'}
                                className="h-8"
                              />
                              {track.error && (
                                <p className="flex items-center gap-1 text-xs text-destructive">
                                  <AlertCircle className="h-3 w-3" />
                                  {track.error}
                                </p>
                              )}
                              {track.isDuplicate && (
                                <p className="text-xs text-amber-600">
                                  Duplicate of &ldquo;{track.existingTrackInfo?.title}&rdquo;
                                  &mdash; will re-upload to S3, skip DB insert
                                </p>
                              )}
                              {track.releaseTitle && (
                                <p className="text-xs text-muted-foreground">
                                  Release: {track.releaseTitle}
                                  {track.releaseCreated && (
                                    <Badge variant="outline" className="ml-1 text-[10px]">
                                      new
                                    </Badge>
                                  )}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={1}
                              value={track.position}
                              onChange={(e) =>
                                updateTrackPosition(track.id, parseInt(e.target.value, 10) || 1)
                              }
                              disabled={isProcessing || track.status === 'success'}
                              className="h-8 w-16"
                            />
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDuration(track.metadata?.duration)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {track.metadata?.album || '-'}
                          </TableCell>
                          <TableCell className="max-w-32 truncate text-sm text-muted-foreground">
                            {track.metadata?.coverArt
                              ? track.metadata.coverArt.startsWith('data:')
                                ? `[embedded - ${Math.round(track.metadata.coverArt.length / 1024)}KB]`
                                : track.metadata.coverArt
                              : '-'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatFileSize(track.fileSize)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeTrack(track.id)}
                              disabled={isProcessing || track.status === 'success'}
                              className="h-8 w-8"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </>
          )}

          {/* Progress during processing or background uploading */}
          {(isProcessing || backgroundUploading) && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {backgroundUploading ? 'Uploading tracks...' : 'Processing tracks...'}
                  </span>
                  <span>
                    {successCount + errorCount} / {tracks.length}
                  </span>
                </div>
                <Progress value={((successCount + errorCount) / tracks.length) * 100} />
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button variant="outline" onClick={() => router.push('/admin')} disabled={isProcessing}>
            Cancel
          </Button>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {showResults && successCount > 0 && (
              <Button variant="outline" onClick={() => router.push('/admin')}>
                View Tracks
              </Button>
            )}
            <Button
              onClick={processAllTracks}
              disabled={
                isProcessing || pendingCount === 0 || tracks.some((t) => t.status === 'extracting')
              }
              className="w-full sm:w-auto"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {duplicateCount > 0
                    ? `Upload ${pendingCount} Track${pendingCount !== 1 ? 's' : ''} (${pendingCount - duplicateCount} new, ${duplicateCount} re-upload)`
                    : `Upload ${pendingCount} Track${pendingCount !== 1 ? 's' : ''}`}
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
