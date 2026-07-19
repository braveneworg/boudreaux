/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { Card, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Form } from '@/app/components/ui/form';
import {
  useCreateVideoMutation,
  useUnpublishVideoMutation,
  useUpdateVideoMutation,
} from '@/hooks/mutations/use-video-mutations';
import { composeArtistString, splitFeaturedArtists } from '@/lib/utils/artist-name-split';
import { generateObjectId } from '@/lib/utils/generate-object-id';
import { createVideoSchema, type VideoFormData } from '@/lib/validation/create-video-schema';
import type { VideoLevelSuggestionField } from '@/lib/validation/video-enrichment-schema';
import type { VideoRow } from '@/lib/validation/video-schema';
import { ZinePanel } from '@/ui/zine-panel';

import { useVideoProbePrefillQuery } from './_hooks/use-video-probe-prefill-query';
import { useVideoProducersQuery } from './_hooks/use-video-producers-query';
import { useVideoQuery } from './_hooks/use-video-query';
import { VideoEnrichmentErrorBoundary } from './videos/enrichment/video-enrichment-error-boundary';
import { VideoEnrichmentPanel } from './videos/enrichment/video-enrichment-panel';
import { VideoTechnicalMetadataCard } from './videos/enrichment/video-technical-metadata-card';
import { useVideoArtistReview } from './videos/use-video-artist-review';
import { useVideoDraft } from './videos/use-video-draft';
import { useVideoPosterUpload } from './videos/use-video-poster-upload';
import { useVideoUpload } from './videos/use-video-upload';
import { VideoArtistReviewSection } from './videos/video-artist-review-section';
import { VideoFileSection } from './videos/video-file-section';
import { VideoFormFooter } from './videos/video-form-footer';
import {
  applyServerFieldErrors,
  applyServerProbePrefill,
  buildVideoDefaults,
  mapVideoToFormValues,
  shapePublish,
} from './videos/video-form-helpers';
import { bestPosterCandidateIndex, type PosterCandidate } from './videos/video-metadata';
import { VideoMetadataSection } from './videos/video-metadata-section';
import { posterCandidateToFile, VideoPosterSection } from './videos/video-poster-section';
import { VideoProducersSection } from './videos/video-producers-section';
import { VideoPublishSection } from './videos/video-publish-section';

import type { Control, UseFormReturn } from 'react-hook-form';

type SubmitIntent = 'save' | 'publish';

export interface VideoFormProps {
  videoId?: string;
}

interface SubmitVideoDeps {
  isPersisted: boolean;
  effectiveVideoId: string | undefined;
  preGeneratedId: string;
  form: UseFormReturn<VideoFormData>;
  router: ReturnType<typeof useRouter>;
  createVideoAsync: ReturnType<typeof useCreateVideoMutation>['createVideoAsync'];
  updateVideoAsync: ReturnType<typeof useUpdateVideoMutation>['updateVideoAsync'];
}

/**
 * Merge reviewed artist details into the form payload when present.
 * Keeps `onValidSubmit` under the complexity cap by extracting the conditional.
 */
const mergeArtistDetails = (
  data: VideoFormData,
  details: VideoFormData['artistDetails']
): VideoFormData => (details?.length ? { ...data, artistDetails: details } : data);

interface ResolveSubmitPosterArgs {
  candidate: Blob | null;
  posterUrl: string | undefined;
  uploadPoster: (file: File) => Promise<void>;
  getPosterUrl: () => string | undefined;
}

/** Commit the visible candidate frame before submit; '' + ok:false = upload failed. */
const resolveSubmitPosterUrl = async ({
  candidate,
  posterUrl,
  uploadPoster,
  getPosterUrl,
}: ResolveSubmitPosterArgs): Promise<{ ok: boolean; posterUrl: string }> => {
  if (posterUrl) return { ok: true, posterUrl };
  if (!candidate) return { ok: true, posterUrl: '' };
  await uploadPoster(posterCandidateToFile(candidate));
  const uploaded = getPosterUrl();
  return uploaded ? { ok: true, posterUrl: uploaded } : { ok: false, posterUrl: '' };
};

/** Dispatch to the create/update mutation, then map errors or navigate on success. */
const submitVideo = async (data: VideoFormData, deps: SubmitVideoDeps): Promise<void> => {
  const { isPersisted, effectiveVideoId, preGeneratedId, form, router } = deps;
  const result =
    isPersisted && effectiveVideoId
      ? await deps.updateVideoAsync({ id: effectiveVideoId, values: data })
      : await deps.createVideoAsync({ ...data, preGeneratedId });

  if (!result.success) {
    applyServerFieldErrors(form.setError, result.errors);
    toast.error(
      result.errors?.general?.[0] ?? `Failed to ${isPersisted ? 'update' : 'create'} the video.`
    );
    return;
  }

  toast.success(`Video ${isPersisted ? 'saved' : 'created'} successfully.`);
  // Create lands on the new video's edit page so the admin can watch the
  // probe + auto-kicked enrichment complete; a persisted (edit/draft) save
  // returns to the list.
  router.push(isPersisted ? '/admin/videos' : `/admin/videos/${preGeneratedId}`);
};

interface EnrichmentPanelMountProps {
  videoId: string | undefined;
  category: VideoFormData['category'] | undefined;
  control: Control<VideoFormData>;
  onApplyVideoSuggestion: (field: VideoLevelSuggestionField, value: string) => void;
}

export interface UseVideoProducersPrefillArgs {
  videoId: string | undefined;
  isEditMode: boolean;
  video: VideoRow | null | undefined;
  form: UseFormReturn<VideoFormData>;
}

/**
 * Fetches producers for edit-mode and sets the RHF field once both the main
 * video reset and the producers query have settled — keeping `VideoForm` under
 * the ESLint complexity cap of 10.
 */
export const useVideoProducersPrefill = ({
  videoId,
  isEditMode,
  video,
  form,
}: UseVideoProducersPrefillArgs): void => {
  const { data: producerData } = useVideoProducersQuery(videoId ?? '', { enabled: isEditMode });
  const hasPrefilled = useRef(false);

  useEffect(() => {
    if (!hasPrefilled.current && isEditMode && video && producerData !== undefined) {
      form.setValue('producers', producerData);
      hasPrefilled.current = true;
    }
  }, [isEditMode, video, producerData, form]);
};

interface UseVideoFormResetArgs {
  isEditMode: boolean;
  video: VideoRow | null | undefined;
  form: UseFormReturn<VideoFormData>;
}

/**
 * Resets the form to the loaded video's values once the query settles.
 * Extracted to keep `VideoForm` under the ESLint complexity cap.
 */
const useVideoFormReset = ({ isEditMode, video, form }: UseVideoFormResetArgs): void => {
  useEffect(() => {
    if (isEditMode && video) {
      form.reset(mapVideoToFormValues(video));
    }
  }, [isEditMode, video, form]);
};

interface UseServerProbePrefillArgs {
  s3Key: string;
  preGeneratedId: string;
  uploadStatus: string;
  form: UseFormReturn<VideoFormData>;
}

/**
 * Watches the probe query result and applies the returned tags onto the form
 * (only-if-empty), keeping `VideoForm` under the ESLint complexity cap.
 */
const useServerProbePrefill = ({
  s3Key,
  preGeneratedId,
  uploadStatus,
  form,
}: UseServerProbePrefillArgs): void => {
  const { data: probeData } = useVideoProbePrefillQuery(s3Key, preGeneratedId, {
    enabled: uploadStatus === 'success',
  });

  useEffect(() => {
    if (probeData?.ok === true) {
      applyServerProbePrefill(form, probeData.tags);
    }
  }, [probeData, form]);
};

interface UseVideoUnpublishArgs {
  videoId: string | undefined;
  unpublishVideoAsync: ReturnType<typeof useUnpublishVideoMutation>['unpublishVideoAsync'];
  router: ReturnType<typeof useRouter>;
}

/** Unpublish the video then redirect to the admin list, or show an error toast. */
const handleVideoUnpublish = async ({
  videoId,
  unpublishVideoAsync,
  router,
}: UseVideoUnpublishArgs): Promise<void> => {
  if (!videoId) return;
  const result = await unpublishVideoAsync({ videoId });
  if (result.success) {
    router.push('/admin/videos');
  } else {
    toast.error('Failed to unpublish the video.');
  }
};

/** Returns the `publishedAt` value from a video row, or null when not yet loaded. */
const getVideoPublishedAt = (video: VideoRow | null | undefined): Date | null | undefined =>
  video ? video.publishedAt : undefined;

/** Save is blocked while either the video multipart or the poster PUT is in flight. */
const isSaveBlocked = (uploadStatus: string, isPosterUploading: boolean): boolean =>
  uploadStatus === 'uploading' || isPosterUploading;

/** The blob the submit path auto-uploads — the selected candidate's, if any. */
const selectedCandidateBlob = (candidates: PosterCandidate[], selectedIndex: number): Blob | null =>
  candidates.at(selectedIndex)?.blob ?? null;

interface PersistedRow {
  /** True once a row exists (edit mode, or a draft was created at upload). */
  isPersisted: boolean;
  /** The id of the persisted row (edit id, else draft id), or undefined. */
  effectiveVideoId: string | undefined;
}

/**
 * Fold edit-mode + the draft-at-upload id into the "row exists" state the
 * submit path and enrichment panel key off. Extracted to keep `VideoForm`
 * under the ESLint complexity cap.
 */
const resolvePersistedRow = (
  videoId: string | undefined,
  isEditMode: boolean,
  draftId: string | null
): PersistedRow => ({
  isPersisted: isEditMode || draftId !== null,
  effectiveVideoId: videoId ?? draftId ?? undefined,
});

/** MUSIC-only, row-required: mounts as soon as a draft/edit row exists. */
const EnrichmentPanelMount = ({
  videoId,
  category,
  control,
  onApplyVideoSuggestion,
}: EnrichmentPanelMountProps): React.ReactElement | null =>
  videoId !== undefined && category === 'MUSIC' ? (
    <VideoEnrichmentErrorBoundary>
      <VideoEnrichmentPanel
        videoId={videoId}
        control={control}
        onApplyVideoSuggestion={onApplyVideoSuggestion}
      />
    </VideoEnrichmentErrorBoundary>
  ) : null;

export const VideoForm = ({ videoId }: VideoFormProps): React.ReactElement => {
  const router = useRouter();
  const isEditMode = videoId !== undefined;
  const [preGeneratedId] = useState<string>(() => videoId ?? generateObjectId());
  const [posterCandidates, setPosterCandidates] = useState<PosterCandidate[]>([]);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(0);

  /** Tracks whether the next submit is a Save or a Publish. */
  const submitIntentRef = useRef<SubmitIntent>('save');

  const { createVideoAsync, isCreatingVideo } = useCreateVideoMutation();
  const { updateVideoAsync, isUpdatingVideo } = useUpdateVideoMutation();
  const { unpublishVideoAsync } = useUnpublishVideoMutation();
  const { data: video, isPending } = useVideoQuery(videoId ?? '', { enabled: isEditMode });

  const form = useForm<VideoFormData>({
    resolver: zodResolver(createVideoSchema),
    defaultValues: buildVideoDefaults(),
  });
  const { control, setValue } = form;

  useVideoFormReset({ isEditMode, video, form });
  useVideoProducersPrefill({ videoId, isEditMode, video, form });

  const s3Key = useWatch({ control, name: 's3Key' });
  const artistValue = useWatch({ control, name: 'artist', defaultValue: '' });
  const categoryValue = useWatch({ control, name: 'category' });
  const isSubmitting = isCreatingVideo || isUpdatingVideo;

  const { entries, updateDraft, buildArtistDetails, primarySplitParts } =
    useVideoArtistReview(artistValue);

  // The draft hook must sit before the upload hook so its handleUploadComplete
  // is available to wire; it in turn depends on buildArtistDetails above.
  const { draftId, handleUploadComplete } = useVideoDraft({
    form,
    preGeneratedId,
    isEditMode,
    getArtistDetails: buildArtistDetails,
  });
  // Capturing a fresh candidate set pre-selects the sharpest frame, so the
  // Save auto-upload commits exactly what the old single-winner capture did.
  const handlePosterCandidates = useCallback((candidates: PosterCandidate[]): void => {
    setPosterCandidates(candidates);
    setSelectedCandidateIndex(bestPosterCandidateIndex(candidates));
  }, []);
  const upload = useVideoUpload({
    preGeneratedId,
    form,
    onPosterCandidates: handlePosterCandidates,
    onUploadComplete: handleUploadComplete,
  });
  // Owned by the form (not the section) so Save can auto-commit the visible
  // candidate frame before submit and the footer can gate on the in-flight PUT.
  const poster = useVideoPosterUpload({ preGeneratedId, setValue });

  const { isPersisted, effectiveVideoId } = resolvePersistedRow(videoId, isEditMode, draftId);
  const selectedPosterBlob = selectedCandidateBlob(posterCandidates, selectedCandidateIndex);

  useServerProbePrefill({ s3Key, preGeneratedId, uploadStatus: upload.status, form });

  const handleSelectDate = useCallback(
    (dateString: string, fieldName: string): void => {
      setValue(fieldName as keyof VideoFormData, dateString, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [setValue]
  );

  const handleApplyVideoSuggestion = useCallback(
    (field: VideoLevelSuggestionField, value: string): void => {
      if (field === 'featuredArtist') {
        const parts = splitFeaturedArtists(form.getValues('artist'));
        const [primary, ...featured] = parts;
        const composed = primary
          ? composeArtistString(primary.name, [...featured.map((part) => part.name), value])
          : value;
        setValue('artist', composed, { shouldDirty: true, shouldValidate: true });
        return;
      }
      setValue(field, value, { shouldDirty: true, shouldValidate: true });
    },
    [form, setValue]
  );

  const handleApplySplit = useCallback(
    (parts: string[]): void => {
      const existing = splitFeaturedArtists(form.getValues('artist'))
        .filter((part) => part.role === 'featured')
        .map((part) => part.name);
      const composed = composeArtistString(parts[0], [...parts.slice(1), ...existing]);
      setValue('artist', composed, { shouldDirty: true, shouldValidate: true });
    },
    [form, setValue]
  );

  const isDraft = !getVideoPublishedAt(video);
  /** Shared label for the breadcrumb and the card title. */
  const formTitle = isEditMode ? 'Edit Video' : 'New Video';
  /** Footer mode: drives Publish vs Unpublish button. */
  const footerMode: 'draft' | 'published' = isDraft ? 'draft' : 'published';
  /** True when no file has been uploaded yet — used to disable Save and show a hint. */
  const isFileMissing = !s3Key;

  const onValidSubmit = useCallback(
    async (data: VideoFormData): Promise<void> => {
      const intent = submitIntentRef.current;
      submitIntentRef.current = 'save';
      // Commit the visible candidate frame before submit so Save (or Publish)
      // persists the poster the admin can see, not the empty default.
      const resolvedPoster = await resolveSubmitPosterUrl({
        candidate: selectedPosterBlob,
        posterUrl: data.posterUrl,
        uploadPoster: poster.uploadPoster,
        getPosterUrl: () => form.getValues('posterUrl'),
      });
      if (!resolvedPoster.ok) {
        toast.error('Poster upload failed — try again or pick a different image.');
        return;
      }
      const shaped = shapePublish(mergeArtistDetails(data, buildArtistDetails()), intent, isDraft);
      return submitVideo(
        { ...shaped, posterUrl: resolvedPoster.posterUrl },
        {
          isPersisted,
          effectiveVideoId,
          preGeneratedId,
          form,
          router,
          createVideoAsync,
          updateVideoAsync,
        }
      );
    },
    [
      selectedPosterBlob,
      poster.uploadPoster,
      isDraft,
      isPersisted,
      effectiveVideoId,
      preGeneratedId,
      form,
      router,
      createVideoAsync,
      updateVideoAsync,
      buildArtistDetails,
    ]
  );

  const handlePublish = useCallback(() => {
    submitIntentRef.current = 'publish';
  }, []);

  const handleUnpublish = useCallback(
    (): Promise<void> => handleVideoUnpublish({ videoId, unpublishVideoAsync, router }),
    [videoId, unpublishVideoAsync, router]
  );

  const handleCancel = useCallback(() => router.push('/admin/videos'), [router]);

  if (isEditMode && isPending) {
    return <div className="flex items-center justify-center p-8 text-zinc-700">Loading video…</div>;
  }

  return (
    <ZinePanel
      accent="storm"
      tape={false}
      breadcrumbs={[
        { anchorText: 'Admin', url: '/admin', isActive: false },
        { anchorText: formTitle, url: '/admin/videos', isActive: true },
      ]}
    >
      <Card className="w-full border-none px-0 pb-0">
        <CardHeader className="px-0">
          <CardTitle>{formTitle}</CardTitle>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onValidSubmit)} noValidate className="space-y-8">
            <VideoFileSection control={control} upload={upload} />
            {isEditMode && video ? <VideoTechnicalMetadataCard video={video} /> : null}
            <VideoMetadataSection
              control={control}
              setValue={setValue}
              onSelectDate={handleSelectDate}
            />
            <VideoArtistReviewSection
              entries={entries}
              updateDraft={updateDraft}
              primarySplitParts={primarySplitParts}
              onApplySplit={handleApplySplit}
            />
            <VideoProducersSection control={control} />
            <EnrichmentPanelMount
              videoId={effectiveVideoId}
              category={categoryValue}
              control={control}
              onApplyVideoSuggestion={handleApplyVideoSuggestion}
            />
            <VideoPosterSection
              control={control}
              candidates={posterCandidates}
              selectedIndex={selectedCandidateIndex}
              onSelectCandidate={setSelectedCandidateIndex}
              uploadedPosterUrl={poster.uploadedPosterUrl}
              isUploading={poster.isUploading}
              errorMessage={poster.errorMessage}
              uploadPoster={poster.uploadPoster}
            />
            <VideoPublishSection control={control} onSelectDate={handleSelectDate} />

            {isFileMissing && (
              <p role="status" className="text-sm text-zinc-700">
                Upload a video file to enable saving.
              </p>
            )}

            <VideoFormFooter
              mode={footerMode}
              isSubmitting={isSubmitting}
              isUploading={isSaveBlocked(upload.status, poster.isUploading)}
              onCancel={handleCancel}
              onPublish={handlePublish}
              onUnpublish={handleUnpublish}
              isDirty={form.formState.isDirty}
            />
          </form>
        </Form>
      </Card>
    </ZinePanel>
  );
};
