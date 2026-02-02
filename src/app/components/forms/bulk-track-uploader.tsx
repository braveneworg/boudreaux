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
import { getPresignedUploadUrlsAction } from '@/lib/actions/presigned-upload-actions';
import type { AudioMetadata } from '@/lib/services/audio-metadata-service';
import { cn } from '@/lib/utils';
import { uploadFilesToS3 } from '@/lib/utils/direct-upload';

import { BreadcrumbMenu } from '../ui/breadcrumb-menu';

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
    | 'error';
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

export default function BulkTrackUploader() {
  const [tracks, setTracks] = useState<BulkTrackItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoCreateRelease, setAutoCreateRelease] = useState(true);
  const [_results, setResults] = useState<BulkTrackResult[]>([]);
  const [showResults, setShowResults] = useState(false);
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
   * Handle file selection
   */
  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
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

      // Extract metadata for each file
      for (const track of newTracks) {
        setTracks((prev) =>
          prev.map((t) => (t.id === track.id ? { ...t, status: 'extracting' as const } : t))
        );

        const metadata = await extractMetadata(track.file);

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
      }

      // Clear the input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      toast.success(`Added ${audioFiles.length} track(s)`);
    },
    [extractMetadata, tracks.length]
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
      // Step 1: Upload all audio files to S3
      const filesToUpload = tracks.filter((t) => t.status === 'extracted');

      if (filesToUpload.length === 0) {
        toast.error('No tracks ready for upload');
        setIsProcessing(false);
        return;
      }

      // Update status to uploading
      setTracks((prev) =>
        prev.map((t) =>
          filesToUpload.some((f) => f.id === t.id)
            ? { ...t, status: 'uploading' as const, progress: 0 }
            : t
        )
      );

      // Get presigned URLs for all files
      const fileInfos = filesToUpload.map((track) => ({
        fileName: track.file.name,
        contentType: track.file.type,
        fileSize: track.file.size,
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

      // Step 2: Create tracks in database
      setTracks((prev) =>
        prev.map((t) =>
          uploadedTracks.some((u) => u.id === t.id) ? { ...t, status: 'creating' as const } : t
        )
      );

      const trackData: BulkTrackData[] = uploadedTracks.map((track) => ({
        title: track.title,
        duration: track.metadata?.duration || 0,
        audioUrl: track.uploadedUrl!,
        position: track.position,
        coverArt: track.metadata?.coverArt,
        album: track.metadata?.album,
        year: track.metadata?.year,
        date: track.metadata?.date,
        label: track.metadata?.label,
        catalogNumber: track.metadata?.catalogNumber,
        albumArtist: track.metadata?.albumArtist,
        lossless: track.metadata?.lossless,
      }));

      const createResult = await bulkCreateTracksAction(trackData, autoCreateRelease);

      // Update tracks with create results
      for (const result of createResult.results) {
        const track = uploadedTracks[result.index];
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

      if (createResult.success) {
        toast.success(`Successfully created ${createResult.successCount} track(s)`);
      } else if (createResult.successCount > 0) {
        toast.warning(
          `Created ${createResult.successCount} track(s), ${createResult.failedCount} failed`
        );
      } else {
        toast.error(`Failed to create tracks: ${createResult.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Bulk upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Bulk upload failed');

      // Mark remaining tracks as error
      setTracks((prev) =>
        prev.map((t) =>
          t.status === 'uploading' || t.status === 'creating'
            ? { ...t, status: 'error' as const, error: 'Processing interrupted' }
            : t
        )
      );
    } finally {
      setIsProcessing(false);
    }
  }, [tracks, autoCreateRelease]);

  const pendingCount = tracks.filter(
    (t) => t.status === 'pending' || t.status === 'extracting' || t.status === 'extracted'
  ).length;
  const successCount = tracks.filter((t) => t.status === 'success').length;
  const errorCount = tracks.filter((t) => t.status === 'error').length;

  const getStatusIcon = (status: BulkTrackItem['status']) => {
    switch (status) {
      case 'pending':
      case 'extracting':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case 'extracted':
        return <FileAudio className="h-4 w-4 text-blue-500" />;
      case 'uploading':
      case 'creating':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'uploaded':
        return <CheckCircle2 className="h-4 w-4 text-blue-500" />;
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
              className={cn(
                'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8',
                'transition-colors hover:border-primary/50',
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
            </>
          )}

          {/* Track List */}
          {tracks.length > 0 && (
            <>
              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Tracks ({tracks.length})</h3>
                  <div className="flex items-center gap-2">
                    {successCount > 0 && (
                      <Badge variant="default" className="bg-green-500">
                        {successCount} created
                      </Badge>
                    )}
                    {errorCount > 0 && <Badge variant="destructive">{errorCount} failed</Badge>}
                    {pendingCount > 0 && <Badge variant="secondary">{pendingCount} pending</Badge>}
                  </div>
                </div>

                <ScrollArea className="h-[400px] rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">Status</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead className="w-20">Position</TableHead>
                        <TableHead className="w-[100px]">Duration</TableHead>
                        <TableHead>Album</TableHead>
                        <TableHead className="w-[100px]">Size</TableHead>
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
                            <div className="flex items-center">{getStatusIcon(track.status)}</div>
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

          {/* Progress during processing */}
          {isProcessing && (
            <>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Processing tracks...</span>
                  <span>
                    {successCount + errorCount} / {tracks.length}
                  </span>
                </div>
                <Progress value={((successCount + errorCount) / tracks.length) * 100} />
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => router.push('/admin')} disabled={isProcessing}>
            Cancel
          </Button>
          <div className="flex gap-2">
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
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload {pendingCount} Track{pendingCount !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
