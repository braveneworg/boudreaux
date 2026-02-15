/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from 'react';

import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Check, ChevronsUpDown, Crop, ImagePlus, Loader2, Undo2, Upload, X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/app/components/ui/command';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/app/components/ui/form';
import {
  ImageCropper,
  BANNER_WIDTH,
  BANNER_HEIGHT,
  type CropResult,
} from '@/app/components/ui/image-cropper';
import { Input } from '@/app/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { Separator } from '@/app/components/ui/separator';
import { Slider } from '@/app/components/ui/slider';
import { Switch } from '@/app/components/ui/switch';
import { Textarea } from '@/app/components/ui/textarea';
import {
  createNotificationBannerAction,
  updateNotificationBannerAction,
} from '@/lib/actions/notification-banner-action';
import { getPresignedUploadUrlsAction } from '@/lib/actions/presigned-upload-actions';
import type { FormState } from '@/lib/types/form-state';
import { cn } from '@/lib/utils';
import { error } from '@/lib/utils/console-logger';
import { uploadFileToS3 } from '@/lib/utils/direct-upload';
import {
  notificationBannerSchema,
  SYSTEM_FONTS,
  type NotificationBannerFormData,
} from '@/lib/validation/notification-banner-schema';

import { BreadcrumbMenu } from '../ui/breadcrumb-menu';
import { DatePicker } from '../ui/datepicker';
import { ResizableTextBox } from '../ui/resizable-text-box';

type FormFieldName = keyof NotificationBannerFormData;

interface NotificationBannerFormProps {
  notificationId?: string;
}

/**
 * Convert a hex color to rgba with specified opacity
 * @param hex - Hex color string (e.g., '#ffffff' or '#fff')
 * @param opacity - Opacity value from 0 to 1
 * @returns rgba string
 */
const hexToRgba = (hex: string, opacity: number): string => {
  // Remove # if present and handle 3-digit hex
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split('')
      .map((c) => c + c)
      .join('');
  }

  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  // Return fallback for invalid hex
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return `rgba(255, 255, 255, ${opacity})`;
  }

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

/**
 * Check if a URL is a remote URL (http/https) that can use Next.js Image
 * Returns false for blob: URLs which need regular img tags
 */
const isRemoteUrl = (url: string): boolean => {
  return url.startsWith('http://') || url.startsWith('https://');
};

/**
 * LocalBlobImage component for rendering local blob URLs
 * Uses Next.js Image with unoptimized flag and identity loader
 * because blob: URLs cannot be optimized by Next.js image optimization
 */
interface LocalBlobImageProps {
  src: string;
  alt: string;
  className?: string;
}

// Identity loader returns the src as-is - required for blob URLs
const blobImageLoader = ({ src }: { src: string }) => src;

function LocalBlobImage({ src, alt, className }: LocalBlobImageProps) {
  return (
    <Image loader={blobImageLoader} src={src} alt={alt} fill className={className} unoptimized />
  );
}

const initialFormState: FormState = {
  fields: {},
  success: false,
};

const ToastContent = ({
  message,
  secondaryMessage,
}: {
  message: string;
  secondaryMessage?: string;
}) => (
  <>
    Notification banner <b>{message.substring(0, 30) || 'entry'}</b>
    {secondaryMessage ? (
      <>
        {' '}
        &mdash; <em>{secondaryMessage.substring(0, 30)}</em>
      </>
    ) : null}{' '}
    saved successfully.
  </>
);

export default function NotificationBannerForm({
  notificationId: initialNotificationId,
}: NotificationBannerFormProps) {
  const isEditMode = !!initialNotificationId;
  const action = isEditMode ? updateNotificationBannerAction : createNotificationBannerAction;

  const [formState, formAction, isPending] = useActionState<FormState, FormData>(
    action,
    initialFormState
  );
  const [isLoadingNotification, setIsLoadingNotification] = useState(!!initialNotificationId);
  const [notificationId, setNotificationId] = useState<string | null>(
    initialNotificationId || null
  );
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isProcessingImage, _setIsProcessingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [_selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string>('');
  const [processedPreviewUrl, setProcessedPreviewUrl] = useState<string>('');
  const [_originalImageBase64, setOriginalImageBase64] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [pendingAutoSave, setPendingAutoSave] = useState(false);
  // Use ref for skipRedirectOnSave to avoid race conditions with async form submission
  const skipRedirectOnSaveRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cropper state
  const [cropperOpen, setCropperOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string>('');
  const [originalFileName, setOriginalFileName] = useState<string>('');

  const router = useRouter();
  const { data: _session } = useSession();
  const formRef = useRef<HTMLFormElement>(null);
  const messageTextareaRef = useRef<HTMLTextAreaElement>(null);
  const secondaryMessageTextareaRef = useRef<HTMLTextAreaElement>(null);

  const form = useForm<NotificationBannerFormData>({
    resolver: zodResolver(notificationBannerSchema),
    defaultValues: {
      message: '',
      secondaryMessage: '',
      notes: '',
      originalImageUrl: '',
      imageUrl: '',
      linkUrl: '',
      backgroundColor: '',
      isOverlayed: true,
      isActive: true,
      displayFrom: '',
      displayUntil: '',
      // Font styling defaults
      messageFont: 'system-ui',
      messageFontSize: 2.5,
      messageContrast: 100,
      secondaryMessageFont: 'system-ui',
      secondaryMessageFontSize: 2,
      secondaryMessageContrast: 95,
      // Text color defaults
      messageTextColor: '#ffffff',
      secondaryMessageTextColor: '#ffffff',
      // Text shadow defaults
      messageTextShadow: true,
      messageTextShadowDarkness: 50,
      secondaryMessageTextShadow: true,
      secondaryMessageTextShadowDarkness: 50,
      // Position defaults (percentage 0-100)
      messagePositionX: 50,
      messagePositionY: 10,
      secondaryMessagePositionX: 50,
      secondaryMessagePositionY: 90,
      // Rotation defaults (degrees)
      messageRotation: 0,
      secondaryMessageRotation: 0,
      // Image offset defaults (percentage -100 to 100)
      imageOffsetX: 0,
      imageOffsetY: 0,
      // Text box dimensions defaults (percentage)
      messageWidth: 80,
      messageHeight: 30,
      secondaryMessageWidth: 80,
      secondaryMessageHeight: 30,
    },
  });
  const { control, setValue, watch } = form;

  // Watch fields for preview
  const watchedOriginalImageUrl = watch('originalImageUrl');
  const watchedImageUrl = watch('imageUrl');
  const watchedBackgroundColor = watch('backgroundColor');
  const watchedMessage = watch('message');
  const watchedSecondaryMessage = watch('secondaryMessage');
  const watchedIsOverlayed = watch('isOverlayed');
  // Font styling watched values for live preview
  const watchedMessageFont = watch('messageFont');
  const watchedMessageFontSize = watch('messageFontSize');
  const watchedMessageContrast = watch('messageContrast');
  const watchedSecondaryMessageFont = watch('secondaryMessageFont');
  const watchedSecondaryMessageFontSize = watch('secondaryMessageFontSize');
  const watchedSecondaryMessageContrast = watch('secondaryMessageContrast');
  // Text color watched values for live preview
  const watchedMessageTextColor = watch('messageTextColor');
  const watchedSecondaryMessageTextColor = watch('secondaryMessageTextColor');
  // Text shadow watched values for live preview
  const watchedMessageTextShadow = watch('messageTextShadow');
  const watchedMessageTextShadowDarkness = watch('messageTextShadowDarkness');
  const watchedSecondaryMessageTextShadow = watch('secondaryMessageTextShadow');
  const watchedSecondaryMessageTextShadowDarkness = watch('secondaryMessageTextShadowDarkness');
  // Position watched values for live preview
  const watchedMessagePositionX = watch('messagePositionX');
  const watchedMessagePositionY = watch('messagePositionY');
  const watchedSecondaryMessagePositionX = watch('secondaryMessagePositionX');
  const watchedSecondaryMessagePositionY = watch('secondaryMessagePositionY');
  // Rotation watched values for live preview
  const watchedMessageRotation = watch('messageRotation');
  const watchedSecondaryMessageRotation = watch('secondaryMessageRotation');
  // Image offset watched values for live preview
  const watchedImageOffsetX = watch('imageOffsetX');
  const watchedImageOffsetY = watch('imageOffsetY');
  // Text box dimension watched values for live preview
  const watchedMessageWidth = watch('messageWidth');
  const watchedMessageHeight = watch('messageHeight');
  const watchedSecondaryMessageWidth = watch('secondaryMessageWidth');
  const watchedSecondaryMessageHeight = watch('secondaryMessageHeight');

  // Drag state for positioning text
  const [isDraggingMessage, setIsDraggingMessage] = useState(false);
  const [isDraggingSecondary, setIsDraggingSecondary] = useState(false);
  // Rotation drag state
  const [isRotatingMessage, setIsRotatingMessage] = useState(false);
  const [isRotatingSecondary, setIsRotatingSecondary] = useState(false);
  // Selection state for text boxes
  const [selectedTextBox, setSelectedTextBox] = useState<'message' | 'secondary' | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Load Google Fonts for preview rendering
  useEffect(() => {
    // Google Fonts that need to be loaded for the font selector preview
    const googleFonts = [
      'Roboto',
      'Open+Sans',
      'Lato',
      'Montserrat',
      'Oswald',
      'Playfair+Display',
      'Bebas+Neue',
      'Anton',
      'Fjalla+One',
      'Archivo+Black',
    ];

    const fontLink = document.getElementById('notification-banner-fonts');
    if (!fontLink) {
      const link = document.createElement('link');
      link.id = 'notification-banner-fonts';
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?${googleFonts.map((f) => `family=${f}:wght@400;700`).join('&')}&display=swap`;
      document.head.appendChild(link);
    }
  }, []);

  // Fetch notification data when initialNotificationId is provided
  useEffect(() => {
    if (!initialNotificationId) return;

    const fetchNotification = async () => {
      try {
        setIsLoadingNotification(true);
        const response = await fetch(`/api/notifications/${initialNotificationId}`);

        if (!response.ok) {
          const errorData = await response.json();
          toast.error(errorData.error || 'Failed to load notification');
          return;
        }

        const notification = await response.json();

        const formatDate = (dateValue: string | Date | null | undefined): string => {
          if (!dateValue) return '';
          const date = new Date(dateValue);
          return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
        };

        form.reset({
          message: notification.message || '',
          secondaryMessage: notification.secondaryMessage || '',
          notes: notification.notes || '',
          originalImageUrl: notification.originalImageUrl || '',
          imageUrl: notification.imageUrl || '',
          linkUrl: notification.linkUrl || '',
          backgroundColor: notification.backgroundColor || '',
          isOverlayed: notification.isOverlayed ?? true,
          isActive: notification.isActive ?? true,
          displayFrom: formatDate(notification.displayFrom),
          displayUntil: formatDate(notification.displayUntil),
          // Font styling fields
          messageFont: notification.messageFont || 'system-ui',
          messageFontSize: notification.messageFontSize ?? 2.5,
          messageContrast: notification.messageContrast ?? 100,
          secondaryMessageFont: notification.secondaryMessageFont || 'system-ui',
          secondaryMessageFontSize: notification.secondaryMessageFontSize ?? 2,
          secondaryMessageContrast: notification.secondaryMessageContrast ?? 95,
          // Text color fields
          messageTextColor: notification.messageTextColor || '#ffffff',
          secondaryMessageTextColor: notification.secondaryMessageTextColor || '#ffffff',
          // Text shadow fields
          messageTextShadow: notification.messageTextShadow ?? true,
          messageTextShadowDarkness: notification.messageTextShadowDarkness ?? 50,
          secondaryMessageTextShadow: notification.secondaryMessageTextShadow ?? true,
          secondaryMessageTextShadowDarkness: notification.secondaryMessageTextShadowDarkness ?? 50,
          // Position fields
          messagePositionX: notification.messagePositionX ?? 50,
          messagePositionY: notification.messagePositionY ?? 10,
          secondaryMessagePositionX: notification.secondaryMessagePositionX ?? 50,
          secondaryMessagePositionY: notification.secondaryMessagePositionY ?? 90,
          // Rotation fields
          messageRotation: notification.messageRotation ?? 0,
          secondaryMessageRotation: notification.secondaryMessageRotation ?? 0,
          // Image offset fields
          imageOffsetX: notification.imageOffsetX ?? 0,
          imageOffsetY: notification.imageOffsetY ?? 0,
          // Text box dimension fields
          messageWidth: notification.messageWidth ?? 80,
          messageHeight: notification.messageHeight ?? 30,
          secondaryMessageWidth: notification.secondaryMessageWidth ?? 80,
          secondaryMessageHeight: notification.secondaryMessageHeight ?? 30,
        });

        // Set preview URLs from existing notification
        if (notification.originalImageUrl) {
          setOriginalPreviewUrl(notification.originalImageUrl);
        }
        if (notification.imageUrl) {
          setProcessedPreviewUrl(notification.imageUrl);
        }
      } catch (err) {
        error('Failed to fetch notification:', err);
        toast.error('Failed to load notification data');
      } finally {
        setIsLoadingNotification(false);
      }
    };

    fetchNotification();
  }, [initialNotificationId, form]);

  // Handle form submission success/failure
  useEffect(() => {
    if (formState.success && formState.data?.notificationId) {
      const newId =
        typeof formState.data.notificationId === 'string' ? formState.data.notificationId : null;
      setNotificationId(newId);

      // Only show toast and redirect if not auto-saving image
      if (skipRedirectOnSaveRef.current) {
        // Reset flag but don't redirect - stay on page after image auto-save
        skipRedirectOnSaveRef.current = false;
      } else {
        const message = form.getValues('message');
        const secondaryMessage = form.getValues('secondaryMessage');
        toast.success(
          <ToastContent message={message || ''} secondaryMessage={secondaryMessage || undefined} />
        );
        router.push('/admin/notifications');
      }
    }

    if (formState.errors?.general) {
      toast.error(formState.errors.general[0]);
    } else if (formState.errors && Object.keys(formState.errors).length > 0) {
      // Show first field error if no general error
      const firstField = Object.keys(formState.errors)[0];
      const firstError = formState.errors[firstField]?.[0];
      if (firstError) {
        toast.error(`${firstField}: ${firstError}`);
      }
    }

    // Log any field-specific errors for debugging
    if (formState.errors && Object.keys(formState.errors).length > 0) {
      console.error('[NotificationBanner] Form errors:', formState.errors);
    }
  }, [formState, form, router]);

  // Sync form errors with server-side validation
  useEffect(() => {
    if (formState.errors) {
      Object.entries(formState.errors).forEach(([field, messages]) => {
        if (field !== 'general' && messages && messages.length > 0) {
          form.setError(field as FormFieldName, {
            type: 'server',
            message: messages[0],
          });
        }
      });
    }
  }, [formState.errors, form]);

  const handleDateSelect = (dateString: string, fieldName: string) => {
    const dateOnly = dateString.split('T')[0];
    if (fieldName === 'displayFrom') {
      setValue('displayFrom', dateOnly);
    } else if (fieldName === 'displayUntil') {
      setValue('displayUntil', dateOnly);
    }
  };

  // Process a file for upload (shared between file input and drag-drop)
  const processFile = useCallback((file: File) => {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please select a valid image file (JPEG, PNG, WebP, or GIF)');
      return;
    }

    // Validate file size (max 50MB before resize)
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Image must be less than 50MB');
      return;
    }

    setSelectedFile(file);
    setOriginalFileName(file.name);

    // Create local preview and open cropper
    const localPreview = URL.createObjectURL(file);
    setImageToCrop(localPreview);
    setCropperOpen(true);
  }, []);

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile]
  );

  // Handle file selection for image upload
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile]
  );

  /**
   * Converts a Blob to a base64 string
   */
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remove the data URL prefix to get just the base64 string
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  /**
   * Handles the crop completion from the ImageCropper
   * Uploads the cropped image - text overlay is rendered dynamically, not burned in
   */
  const handleCropComplete = useCallback(
    async (result: CropResult) => {
      setCropperOpen(false);

      // If the cropper provided a background color, update the form
      if (result.backgroundColor) {
        setValue('backgroundColor', result.backgroundColor);
      }

      // Clear any existing image URLs while uploading
      setValue('originalImageUrl', '');
      setValue('imageUrl', '');

      try {
        setIsUploadingImage(true);
        setUploadProgress('Processing image...');

        console.info('[NotificationBanner] Starting image upload flow');

        // Convert original cropped image to base64
        const base64 = await blobToBase64(result.blob);
        setOriginalImageBase64(base64);

        // Set local preview of original image
        const originalPreview = URL.createObjectURL(result.blob);
        setOriginalPreviewUrl(originalPreview);

        // Create a File from the original cropped blob
        const baseFileName = originalFileName.replace(/\.[^/.]+$/, '');
        const originalFile = new File([result.blob], `${baseFileName}-original.jpg`, {
          type: 'image/jpeg',
        });

        console.info('[NotificationBanner] Created original file:', {
          name: originalFile.name,
          size: originalFile.size,
          type: originalFile.type,
        });

        setUploadProgress('Uploading original image...');

        // Generate a temporary ID for new notifications
        const uploadId = notificationId || `temp-${Date.now()}`;
        console.info('[NotificationBanner] Using upload ID:', uploadId);

        // Get presigned URL for original image
        const originalPresignedResult = await getPresignedUploadUrlsAction(
          'notifications',
          uploadId,
          [
            {
              fileName: originalFile.name,
              contentType: originalFile.type,
              fileSize: originalFile.size,
            },
          ]
        );

        console.info('[NotificationBanner] Presigned URL result:', {
          success: originalPresignedResult.success,
          error: originalPresignedResult.error,
          hasData: !!originalPresignedResult.data?.[0],
        });

        if (!originalPresignedResult.success || !originalPresignedResult.data?.[0]) {
          throw new Error(originalPresignedResult.error || 'Failed to get upload URL');
        }

        // Upload original to S3
        console.info('[NotificationBanner] Starting S3 upload for original image');
        const originalUploadResult = await uploadFileToS3(
          originalFile,
          originalPresignedResult.data[0]
        );

        console.info('[NotificationBanner] Original upload result:', {
          success: originalUploadResult.success,
          error: originalUploadResult.error,
          cdnUrl: originalUploadResult.cdnUrl,
        });

        if (!originalUploadResult.success) {
          throw new Error(originalUploadResult.error || 'Original upload failed');
        }

        // Set the original CDN URL in the form
        setValue('originalImageUrl', originalUploadResult.cdnUrl);
        setOriginalPreviewUrl(originalUploadResult.cdnUrl);
        console.info('[NotificationBanner] Original image URL set:', originalUploadResult.cdnUrl);

        // Always use the original image for imageUrl - text overlay is rendered dynamically
        // No need to burn text into the image since it's rendered via CSS/HTML like the preview
        setValue('imageUrl', originalUploadResult.cdnUrl);
        setProcessedPreviewUrl(originalUploadResult.cdnUrl);
        console.info(
          '[NotificationBanner] Using original for imageUrl (text overlay rendered dynamically)'
        );

        setUploadProgress('Upload complete! Saving...');
        console.info(
          '[NotificationBanner] Image upload flow completed successfully, triggering auto-save'
        );

        // Trigger auto-save after image upload
        setPendingAutoSave(true);
      } catch (err) {
        console.error('[NotificationBanner] Image upload failed:', err);
        error('Image upload failed:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to upload image');
        setUploadProgress('');

        // Clear the previews on error
        setOriginalPreviewUrl('');
        setProcessedPreviewUrl('');
        setOriginalImageBase64('');
        setSelectedFile(null);
      } finally {
        setIsUploadingImage(false);

        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [notificationId, originalFileName, setValue]
  );

  // Clear uploaded image
  const handleClearImage = useCallback(() => {
    setValue('originalImageUrl', '');
    setValue('imageUrl', '');
    setSelectedFile(null);
    if (originalPreviewUrl && !originalPreviewUrl.startsWith('http')) {
      URL.revokeObjectURL(originalPreviewUrl);
    }
    if (processedPreviewUrl && !processedPreviewUrl.startsWith('http')) {
      URL.revokeObjectURL(processedPreviewUrl);
    }
    setOriginalPreviewUrl('');
    setProcessedPreviewUrl('');
    setOriginalImageBase64('');
    setUploadProgress('');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [setValue, originalPreviewUrl, processedPreviewUrl]);

  // Reset to original image (remove text overlay)
  const handleResetToOriginal = useCallback(() => {
    const originalUrl = form.getValues('originalImageUrl');
    if (originalUrl) {
      setValue('imageUrl', originalUrl);
      setProcessedPreviewUrl(originalUrl);
      toast.success('Reset to original image (without text overlay)');
    }
  }, [setValue, form]);

  // Re-crop existing image with current background color settings
  const handleRecropImage = useCallback(async () => {
    // First try to use the local blob URL if we have it (from current session upload)
    if (imageToCrop) {
      setCropperOpen(true);
      return;
    }

    // Otherwise, fetch the uploaded original image and convert to blob URL
    const originalUrl = form.getValues('originalImageUrl');
    const imageUrl = form.getValues('imageUrl');
    const urlToRecrop = originalUrl || imageUrl;

    if (urlToRecrop) {
      try {
        // Show loading state
        setUploadProgress('Loading image for cropping...');

        // Use proxy endpoint to fetch the image to avoid CORS issues
        const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(urlToRecrop)}`;
        const response = await fetch(proxyUrl);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to fetch image');
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        setImageToCrop(blobUrl);
        setCropperOpen(true);
        setUploadProgress('');
      } catch (err) {
        console.error('[NotificationBanner] Failed to load image for re-crop:', err);
        toast.error('Failed to load image for cropping. Please try uploading a new image.');
        setUploadProgress('');
      }
    } else {
      toast.error('No image available to re-crop');
    }
  }, [imageToCrop, form]);

  /**
   * Build FormData from current form values and submit
   * This is extracted so it can be called programmatically after image upload
   */
  const submitForm = useCallback(async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      const fieldErrors = form.formState.errors;
      const errorMessages = Object.entries(fieldErrors)
        .map(([field, err]) => `${field}: ${err?.message}`)
        .filter(Boolean);
      if (errorMessages.length > 0) {
        toast.error(errorMessages.join('; '));
      }
      return false;
    }

    // Build FormData entirely from React Hook Form state to avoid DOM sync issues
    const values = form.getValues();
    const formData = new FormData();

    // Add notification ID for update
    if (notificationId) {
      formData.set('notificationId', notificationId);
    }

    // String fields
    formData.set('message', values.message || '');
    if (values.secondaryMessage) {
      formData.set('secondaryMessage', values.secondaryMessage);
    }
    if (values.notes) {
      formData.set('notes', values.notes);
    }
    if (values.linkUrl) {
      formData.set('linkUrl', values.linkUrl);
    }
    if (values.imageUrl) {
      formData.set('imageUrl', values.imageUrl);
    }
    if (values.originalImageUrl) {
      formData.set('originalImageUrl', values.originalImageUrl);
    }
    if (values.backgroundColor) {
      formData.set('backgroundColor', values.backgroundColor);
    }

    // Date fields (DatePicker doesn't create hidden inputs)
    if (values.displayFrom) {
      formData.set('displayFrom', values.displayFrom);
    }
    if (values.displayUntil) {
      formData.set('displayUntil', values.displayUntil);
    }

    // Boolean fields
    formData.set('isOverlayed', values.isOverlayed ? 'true' : 'false');
    formData.set('isActive', values.isActive ? 'true' : 'false');
    formData.set('messageTextShadow', values.messageTextShadow ? 'true' : 'false');
    formData.set(
      'secondaryMessageTextShadow',
      values.secondaryMessageTextShadow ? 'true' : 'false'
    );

    // Font fields
    formData.set('messageFont', values.messageFont || 'system-ui');
    formData.set('secondaryMessageFont', values.secondaryMessageFont || 'system-ui');

    // Numeric fields
    formData.set('messageFontSize', String(values.messageFontSize));
    formData.set('messageContrast', String(values.messageContrast));
    formData.set('secondaryMessageFontSize', String(values.secondaryMessageFontSize));
    formData.set('secondaryMessageContrast', String(values.secondaryMessageContrast));
    formData.set('messageTextShadowDarkness', String(values.messageTextShadowDarkness));
    formData.set(
      'secondaryMessageTextShadowDarkness',
      String(values.secondaryMessageTextShadowDarkness)
    );

    // Text color fields
    formData.set('messageTextColor', values.messageTextColor || '#ffffff');
    formData.set('secondaryMessageTextColor', values.secondaryMessageTextColor || '#ffffff');

    // Position fields
    formData.set('messagePositionX', String(values.messagePositionX ?? 50));
    formData.set('messagePositionY', String(values.messagePositionY ?? 10));
    formData.set('secondaryMessagePositionX', String(values.secondaryMessagePositionX ?? 50));
    formData.set('secondaryMessagePositionY', String(values.secondaryMessagePositionY ?? 90));

    // Rotation fields
    formData.set('messageRotation', String(values.messageRotation ?? 0));
    formData.set('secondaryMessageRotation', String(values.secondaryMessageRotation ?? 0));

    // Image offset fields
    formData.set('imageOffsetX', String(values.imageOffsetX ?? 0));
    formData.set('imageOffsetY', String(values.imageOffsetY ?? 0));

    // Text box dimension fields
    formData.set('messageWidth', String(values.messageWidth ?? 80));
    formData.set('messageHeight', String(values.messageHeight ?? 30));
    formData.set('secondaryMessageWidth', String(values.secondaryMessageWidth ?? 80));
    formData.set('secondaryMessageHeight', String(values.secondaryMessageHeight ?? 30));

    // Wrap formAction in startTransition for proper React 19 useActionState behavior
    startTransition(() => {
      formAction(formData);
    });
    return true;
  }, [form, formAction, notificationId]);

  // Auto-save after image upload completes
  useEffect(() => {
    if (pendingAutoSave && !isUploadingImage) {
      setPendingAutoSave(false);
      skipRedirectOnSaveRef.current = true; // Don't redirect after auto-save
      console.info('[NotificationBanner] Executing auto-save after image upload');
      submitForm().then((success) => {
        if (success) {
          toast.success(`Image cropped to ${BANNER_WIDTH}×${BANNER_HEIGHT} and saved!`);
          setUploadProgress('');
        } else {
          toast.error(
            'Image uploaded but form has validation errors. Please fix them and save manually.'
          );
          setUploadProgress('');
        }
      });
    }
  }, [pendingAutoSave, isUploadingImage, submitForm]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await submitForm();
  };

  const handleCancel = () => {
    router.push('/admin/notifications');
  };

  /**
   * Handle drag start for message positioning
   */
  const handleMessageDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDraggingMessage(true);
  }, []);

  /**
   * Handle drag start for secondary message positioning
   */
  const handleSecondaryDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDraggingSecondary(true);
  }, []);

  /**
   * Handle drag move for both messages
   */
  const handleDragMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDraggingMessage && !isDraggingSecondary) return;
      if (!previewContainerRef.current) return;

      // Prevent page scrolling while dragging
      e.preventDefault();

      const container = previewContainerRef.current;
      const rect = container.getBoundingClientRect();

      // Get position from mouse or touch event
      let clientX: number;
      let clientY: number;
      if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      // Calculate percentage position (0-100)
      const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));

      if (isDraggingMessage) {
        setValue('messagePositionX', Math.round(x));
        setValue('messagePositionY', Math.round(y));
      } else if (isDraggingSecondary) {
        setValue('secondaryMessagePositionX', Math.round(x));
        setValue('secondaryMessagePositionY', Math.round(y));
      }
    },
    [isDraggingMessage, isDraggingSecondary, setValue]
  );

  /**
   * Handle drag end for both messages
   */
  const handleDragEnd = useCallback(() => {
    setIsDraggingMessage(false);
    setIsDraggingSecondary(false);
  }, []);

  // Add document-level event listeners for drag
  useEffect(() => {
    if (isDraggingMessage || isDraggingSecondary) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      document.addEventListener('touchmove', handleDragMove, { passive: false });
      document.addEventListener('touchend', handleDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('touchmove', handleDragMove);
        document.removeEventListener('touchend', handleDragEnd);
      };
    }
  }, [isDraggingMessage, isDraggingSecondary, handleDragMove, handleDragEnd]);

  /**
   * Handle rotation start for message
   */
  const handleMessageRotateStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRotatingMessage(true);
  }, []);

  /**
   * Handle rotation start for secondary message
   */
  const handleSecondaryRotateStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRotatingSecondary(true);
  }, []);

  /**
   * Handle rotation move for both messages
   */
  const handleRotationMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isRotatingMessage && !isRotatingSecondary) return;
      if (!previewContainerRef.current) return;

      // Prevent page scrolling while rotating
      e.preventDefault();

      const container = previewContainerRef.current;
      const rect = container.getBoundingClientRect();

      // Get position from mouse or touch event
      let clientX: number;
      let clientY: number;
      if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      // Get the center point of the text element
      const posX = isRotatingMessage
        ? (watchedMessagePositionX ?? 50)
        : (watchedSecondaryMessagePositionX ?? 50);
      const posY = isRotatingMessage
        ? (watchedMessagePositionY ?? 10)
        : (watchedSecondaryMessagePositionY ?? 90);

      const centerX = rect.left + (rect.width * posX) / 100;
      const centerY = rect.top + (rect.height * posY) / 100;

      // Calculate angle from center to cursor
      const angle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
      // Adjust so 0° is at the top (add 90°)
      const adjustedAngle = Math.round(angle + 90);
      // Normalize to -180 to 180 range
      const normalizedAngle = adjustedAngle > 180 ? adjustedAngle - 360 : adjustedAngle;

      if (isRotatingMessage) {
        setValue('messageRotation', normalizedAngle);
      } else if (isRotatingSecondary) {
        setValue('secondaryMessageRotation', normalizedAngle);
      }
    },
    [
      isRotatingMessage,
      isRotatingSecondary,
      watchedMessagePositionX,
      watchedMessagePositionY,
      watchedSecondaryMessagePositionX,
      watchedSecondaryMessagePositionY,
      setValue,
    ]
  );

  /**
   * Handle rotation end for both messages
   */
  const handleRotationEnd = useCallback(() => {
    setIsRotatingMessage(false);
    setIsRotatingSecondary(false);
  }, []);

  // Add document-level event listeners for rotation
  useEffect(() => {
    if (isRotatingMessage || isRotatingSecondary) {
      document.addEventListener('mousemove', handleRotationMove);
      document.addEventListener('mouseup', handleRotationEnd);
      document.addEventListener('touchmove', handleRotationMove, { passive: false });
      document.addEventListener('touchend', handleRotationEnd);
      return () => {
        document.removeEventListener('mousemove', handleRotationMove);
        document.removeEventListener('mouseup', handleRotationEnd);
        document.removeEventListener('touchmove', handleRotationMove);
        document.removeEventListener('touchend', handleRotationEnd);
      };
    }
  }, [isRotatingMessage, isRotatingSecondary, handleRotationMove, handleRotationEnd]);

  /**
   * Handle keyboard events for image nudging
   */
  const handlePreviewKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const nudgeAmount = e.shiftKey ? 5 : 1; // Hold Shift for larger nudges

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          setValue('imageOffsetX', Math.max(-100, (watchedImageOffsetX ?? 0) - nudgeAmount));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setValue('imageOffsetX', Math.min(100, (watchedImageOffsetX ?? 0) + nudgeAmount));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setValue('imageOffsetY', Math.max(-100, (watchedImageOffsetY ?? 0) - nudgeAmount));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setValue('imageOffsetY', Math.min(100, (watchedImageOffsetY ?? 0) + nudgeAmount));
          break;
      }
    },
    [watchedImageOffsetX, watchedImageOffsetY, setValue]
  );

  if (isLoadingNotification) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading notification...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <BreadcrumbMenu
        items={[
          { anchorText: 'Admin', url: '/admin', isActive: false },
          { anchorText: 'Notifications', url: '/admin/notifications', isActive: false },
          { anchorText: isEditMode ? 'Edit' : 'New', url: '#', isActive: true },
        ]}
      />

      <Form {...form}>
        <form ref={formRef} onSubmit={handleSubmit} className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {isEditMode ? 'Edit Notification Banner' : 'Create Notification Banner'}
              </CardTitle>
              <CardDescription>
                {isEditMode
                  ? 'Update the notification banner details below.'
                  : 'Create a new notification banner to display on the home page.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Background Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Background Settings</h3>
                <p className="text-sm text-muted-foreground">
                  Upload an image or provide a background color. Images will be automatically
                  resized to 880 pixels wide.
                </p>

                {/* Image Upload */}
                <FormField
                  control={control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Banner Image</FormLabel>
                      <div className="space-y-3">
                        {/* Drop zone */}
                        <div
                          onDragEnter={handleDragEnter}
                          onDragLeave={handleDragLeave}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
                            isDragging
                              ? 'border-primary bg-primary/5'
                              : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/50'
                          } ${isUploadingImage ? 'cursor-not-allowed opacity-50' : ''}`}
                        >
                          <Upload
                            className={`mb-2 h-8 w-8 ${
                              isDragging ? 'text-primary' : 'text-muted-foreground'
                            }`}
                          />
                          <p className="text-sm font-medium">
                            {isDragging ? 'Drop image here' : 'Drag & drop an image here'}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">or click to browse</p>
                        </div>

                        {/* Hidden file input */}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          onChange={handleFileSelect}
                          disabled={isUploadingImage}
                          className="hidden"
                          id="banner-image-upload"
                        />

                        {/* Upload button and progress */}
                        <div className="flex items-center gap-3">
                          <label
                            htmlFor="banner-image-upload"
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                              isUploadingImage ? 'cursor-not-allowed opacity-50' : ''
                            }`}
                          >
                            {isUploadingImage ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Uploading...
                              </>
                            ) : (
                              <>
                                <ImagePlus className="h-4 w-4" />
                                Upload Image
                              </>
                            )}
                          </label>
                          {uploadProgress && (
                            <span className="text-sm text-muted-foreground">{uploadProgress}</span>
                          )}
                          {isProcessingImage && (
                            <span className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Processing image...
                            </span>
                          )}
                        </div>

                        {/* Original and Processed image preview */}
                        {(originalPreviewUrl ||
                          processedPreviewUrl ||
                          watchedImageUrl ||
                          watchedOriginalImageUrl ||
                          field.value) && (
                          <div className="space-y-4">
                            {/* Action buttons */}
                            <div className="flex flex-wrap gap-2">
                              {/* Re-crop button - show when we have an image to re-crop */}
                              {(imageToCrop ||
                                watchedOriginalImageUrl ||
                                watchedImageUrl ||
                                field.value) && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={handleRecropImage}
                                  disabled={isUploadingImage || isProcessingImage}
                                >
                                  <Crop className="mr-2 h-4 w-4" />
                                  Re-crop / Change Background
                                </Button>
                              )}
                              {/* Reset to original button - show when processed differs from original */}
                              {originalPreviewUrl &&
                                processedPreviewUrl &&
                                originalPreviewUrl !== processedPreviewUrl && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleResetToOriginal}
                                    disabled={isProcessingImage || isUploadingImage}
                                  >
                                    <Undo2 className="mr-2 h-4 w-4" />
                                    Reset to Original
                                  </Button>
                                )}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleClearImage}
                              >
                                <X className="mr-2 h-4 w-4" />
                                Remove
                              </Button>
                            </div>

                            {/* Dual preview when we have both */}
                            {originalPreviewUrl &&
                              processedPreviewUrl &&
                              originalPreviewUrl !== processedPreviewUrl && (
                                <div
                                  className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen space-y-4"
                                  style={{ marginTop: '1rem' }}
                                >
                                  {/* Original image - full viewport width */}
                                  <div className="space-y-1">
                                    <p className="px-4 text-sm font-medium text-muted-foreground sm:px-6 md:px-8">
                                      Original
                                    </p>
                                    <div
                                      className="relative w-full overflow-hidden"
                                      style={{ paddingBottom: `${100 / 1.618}%` }}
                                    >
                                      {isRemoteUrl(originalPreviewUrl) ? (
                                        <Image
                                          src={originalPreviewUrl}
                                          alt="Original banner"
                                          fill
                                          className="object-cover"
                                          sizes="100vw"
                                          unoptimized
                                        />
                                      ) : (
                                        <LocalBlobImage
                                          src={originalPreviewUrl}
                                          alt="Original banner"
                                          className="absolute inset-0 h-full w-full object-cover"
                                        />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                            {/* Single preview (when original equals processed or only one exists) */}
                            {(!originalPreviewUrl ||
                              !processedPreviewUrl ||
                              originalPreviewUrl === processedPreviewUrl) && (
                              <div
                                className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen"
                                style={{ marginTop: '1rem' }}
                              >
                                <div
                                  className="relative w-full overflow-hidden"
                                  style={{ paddingBottom: `${100 / 1.618}%` }}
                                >
                                  {/* Compute single preview URL */}
                                  {(processedPreviewUrl ||
                                    originalPreviewUrl ||
                                    watchedImageUrl ||
                                    watchedOriginalImageUrl ||
                                    field.value) &&
                                    (isRemoteUrl(
                                      processedPreviewUrl ||
                                        originalPreviewUrl ||
                                        watchedImageUrl ||
                                        watchedOriginalImageUrl ||
                                        field.value ||
                                        ''
                                    ) ? (
                                      <Image
                                        src={
                                          processedPreviewUrl ||
                                          originalPreviewUrl ||
                                          watchedImageUrl ||
                                          watchedOriginalImageUrl ||
                                          field.value ||
                                          ''
                                        }
                                        alt="Banner preview"
                                        fill
                                        className="object-cover"
                                        sizes="100vw"
                                        unoptimized
                                      />
                                    ) : (
                                      <LocalBlobImage
                                        src={
                                          processedPreviewUrl ||
                                          originalPreviewUrl ||
                                          watchedImageUrl ||
                                          watchedOriginalImageUrl ||
                                          field.value ||
                                          ''
                                        }
                                        alt="Banner preview"
                                        className="absolute inset-0 h-full w-full object-cover"
                                      />
                                    ))}
                                </div>
                                <p className="mt-1 px-4 text-xs text-muted-foreground sm:px-6 md:px-8">
                                  {(originalPreviewUrl || processedPreviewUrl)?.startsWith('blob:')
                                    ? 'Preview (uploading...)'
                                    : 'Uploaded image'}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Hidden fields for form submission */}
                        <FormControl>
                          <Input type="hidden" {...field} />
                        </FormControl>
                      </div>
                      <FormDescription>
                        Upload a banner image. You&apos;ll be able to crop it to show the portion of
                        the image you want. Optionally add a background color for images that
                        don&apos;t fill the frame.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Hidden field for imageUrl (processed/display image) */}
                <FormField
                  control={control}
                  name="imageUrl"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} value={field.value || ''} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Hidden field for originalImageUrl */}
                <FormField
                  control={control}
                  name="originalImageUrl"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} value={field.value || ''} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Hidden fields for text position */}
                <FormField
                  control={control}
                  name="messagePositionX"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} value={field.value ?? 50} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="messagePositionY"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} value={field.value ?? 10} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="secondaryMessagePositionX"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} value={field.value ?? 50} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="secondaryMessagePositionY"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} value={field.value ?? 90} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Hidden fields for text rotation */}
                <FormField
                  control={control}
                  name="messageRotation"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} value={field.value ?? 0} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="secondaryMessageRotation"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} value={field.value ?? 0} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Hidden fields for image offset */}
                <FormField
                  control={control}
                  name="imageOffsetX"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} value={field.value ?? 0} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="imageOffsetY"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input type="hidden" {...field} value={field.value ?? 0} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name="backgroundColor"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Background Color</FormLabel>
                        {field.value && (
                          <span className="text-sm text-muted-foreground">{field.value}</span>
                        )}
                      </div>
                      <FormControl>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            value={field.value || '#000000'}
                            onChange={(e) => setValue('backgroundColor', e.target.value)}
                            className="h-10 w-14 cursor-pointer p-1"
                          />
                          <Input
                            type="text"
                            name="backgroundColor"
                            value={field.value || ''}
                            onChange={(e) => setValue('backgroundColor', e.target.value)}
                            placeholder="#000000"
                            className="flex-1 font-mono"
                            maxLength={7}
                          />
                          {field.value && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setValue('backgroundColor', '')}
                              className="px-2"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </FormControl>
                      <FormDescription>
                        Hex color code (e.g., #ffffff). Used when no image is provided.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Message (Required) */}
                <FormField
                  control={control}
                  name="message"
                  render={({ field: { ref, ...fieldProps } }) => (
                    <FormItem>
                      <FormLabel>Message *</FormLabel>
                      <FormControl>
                        <Textarea
                          ref={(el) => {
                            ref(el);
                            messageTextareaRef.current = el;
                          }}
                          placeholder="Enter the main notification message"
                          rows={4}
                          {...fieldProps}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Secondary Message */}
                <FormField
                  control={control}
                  name="secondaryMessage"
                  render={({ field: { ref, ...fieldProps } }) => (
                    <FormItem>
                      <FormLabel>Secondary Message (Optional)</FormLabel>
                      <FormControl>
                        <Textarea
                          ref={(el) => {
                            ref(el);
                            secondaryMessageTextareaRef.current = el;
                          }}
                          placeholder="Additional context or subtitle"
                          rows={4}
                          {...fieldProps}
                        />
                      </FormControl>
                      <FormDescription>
                        Displayed below the main message in a smaller font.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name="isOverlayed"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Overlay text on image</FormLabel>
                        <FormDescription>
                          When enabled, text will be displayed on top of the background image.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          name={field.name}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Font Styling Settings - only show when overlay is enabled */}
                {watchedIsOverlayed && (
                  <div className="space-y-6 rounded-lg border p-4">
                    <h4 className="font-medium">Text Styling</h4>

                    {/* Message Font Settings */}
                    <div className="space-y-4">
                      <p className="text-sm font-medium text-muted-foreground">
                        Main Message (appears at top)
                      </p>

                      {/* Message Font Selection */}
                      <FormField
                        control={control}
                        name="messageFont"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Font Family</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn(
                                      'w-full justify-between',
                                      !field.value && 'text-muted-foreground'
                                    )}
                                  >
                                    {field.value
                                      ? SYSTEM_FONTS.find((font) => font.value === field.value)
                                          ?.label
                                      : 'Select font...'}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-full p-0">
                                <Command>
                                  <CommandInput placeholder="Search fonts..." />
                                  <CommandList>
                                    <CommandEmpty>No font found.</CommandEmpty>
                                    <CommandGroup>
                                      {SYSTEM_FONTS.map((font) => (
                                        <CommandItem
                                          value={font.label}
                                          key={font.value}
                                          onSelect={() => {
                                            setValue('messageFont', font.value);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              'mr-2 h-4 w-4',
                                              font.value === field.value
                                                ? 'opacity-100'
                                                : 'opacity-0'
                                            )}
                                          />
                                          <span style={{ fontFamily: font.value }}>
                                            {font.label}
                                          </span>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Message Font Size */}
                      <FormField
                        control={control}
                        name="messageFontSize"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Font Size</FormLabel>
                              <span className="text-sm text-muted-foreground">
                                {field.value?.toFixed(1) ?? '2.5'}rem
                              </span>
                            </div>
                            <FormControl>
                              <Slider
                                min={0.5}
                                max={10}
                                step={0.1}
                                value={[field.value ?? 2.5]}
                                onValueChange={(values) => setValue('messageFontSize', values[0])}
                              />
                            </FormControl>
                            <FormDescription>Font size from 0.5rem to 10rem</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Message Contrast */}
                      <FormField
                        control={control}
                        name="messageContrast"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Text Opacity</FormLabel>
                              <span className="text-sm text-muted-foreground">
                                {field.value?.toFixed(0) ?? '100'}%
                              </span>
                            </div>
                            <FormControl>
                              <Slider
                                min={0}
                                max={100}
                                step={1}
                                value={[field.value ?? 100]}
                                onValueChange={(values) => setValue('messageContrast', values[0])}
                              />
                            </FormControl>
                            <FormDescription>
                              Adjust text visibility (100% = fully visible)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Message Text Color */}
                      <FormField
                        control={control}
                        name="messageTextColor"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Text Color</FormLabel>
                              <span className="text-sm text-muted-foreground">
                                {field.value || '#ffffff'}
                              </span>
                            </div>
                            <FormControl>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="color"
                                  value={field.value || '#ffffff'}
                                  onChange={(e) => setValue('messageTextColor', e.target.value)}
                                  className="h-10 w-14 cursor-pointer p-1"
                                />
                                <Input
                                  type="text"
                                  value={field.value || '#ffffff'}
                                  onChange={(e) => setValue('messageTextColor', e.target.value)}
                                  placeholder="#ffffff"
                                  className="flex-1 font-mono"
                                  maxLength={7}
                                />
                              </div>
                            </FormControl>
                            <FormDescription>Choose the text color for the message</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Message Text Shadow */}
                      <FormField
                        control={control}
                        name="messageTextShadow"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel>Text Shadow</FormLabel>
                              <FormDescription>
                                Add a shadow behind the text for better readability
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                name={field.name}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      {/* Message Text Shadow Darkness - only show when shadow is enabled */}
                      {form.watch('messageTextShadow') && (
                        <FormField
                          control={control}
                          name="messageTextShadowDarkness"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between">
                                <FormLabel>Shadow Darkness</FormLabel>
                                <span className="text-sm text-muted-foreground">
                                  {field.value?.toFixed(0) ?? '50'}%
                                </span>
                              </div>
                              <FormControl>
                                <Slider
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={[field.value ?? 50]}
                                  onValueChange={(values) =>
                                    setValue('messageTextShadowDarkness', values[0])
                                  }
                                />
                              </FormControl>
                              <FormDescription>
                                0% = light shadow, 100% = dark shadow
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    <Separator />

                    {/* Secondary Message Font Settings */}
                    <div className="space-y-4">
                      <p className="text-sm font-medium text-muted-foreground">
                        Secondary Message (appears at bottom)
                      </p>

                      {/* Secondary Message Font Selection */}
                      <FormField
                        control={control}
                        name="secondaryMessageFont"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Font Family</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn(
                                      'w-full justify-between',
                                      !field.value && 'text-muted-foreground'
                                    )}
                                  >
                                    {field.value
                                      ? SYSTEM_FONTS.find((font) => font.value === field.value)
                                          ?.label
                                      : 'Select font...'}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-full p-0">
                                <Command>
                                  <CommandInput placeholder="Search fonts..." />
                                  <CommandList>
                                    <CommandEmpty>No font found.</CommandEmpty>
                                    <CommandGroup>
                                      {SYSTEM_FONTS.map((font) => (
                                        <CommandItem
                                          value={font.label}
                                          key={font.value}
                                          onSelect={() => {
                                            setValue('secondaryMessageFont', font.value);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              'mr-2 h-4 w-4',
                                              font.value === field.value
                                                ? 'opacity-100'
                                                : 'opacity-0'
                                            )}
                                          />
                                          <span style={{ fontFamily: font.value }}>
                                            {font.label}
                                          </span>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Secondary Message Font Size */}
                      <FormField
                        control={control}
                        name="secondaryMessageFontSize"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Font Size</FormLabel>
                              <span className="text-sm text-muted-foreground">
                                {field.value?.toFixed(1) ?? '2.0'}rem
                              </span>
                            </div>
                            <FormControl>
                              <Slider
                                min={0.5}
                                max={10}
                                step={0.1}
                                value={[field.value ?? 2]}
                                onValueChange={(values) =>
                                  setValue('secondaryMessageFontSize', values[0])
                                }
                              />
                            </FormControl>
                            <FormDescription>Font size from 0.5rem to 10rem</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Secondary Message Contrast */}
                      <FormField
                        control={control}
                        name="secondaryMessageContrast"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Text Opacity</FormLabel>
                              <span className="text-sm text-muted-foreground">
                                {field.value?.toFixed(0) ?? '95'}%
                              </span>
                            </div>
                            <FormControl>
                              <Slider
                                min={0}
                                max={100}
                                step={1}
                                value={[field.value ?? 95]}
                                onValueChange={(values) =>
                                  setValue('secondaryMessageContrast', values[0])
                                }
                              />
                            </FormControl>
                            <FormDescription>
                              Adjust text visibility (100% = fully visible)
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Secondary Message Text Color */}
                      <FormField
                        control={control}
                        name="secondaryMessageTextColor"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex items-center justify-between">
                              <FormLabel>Text Color</FormLabel>
                              <span className="text-sm text-muted-foreground">
                                {field.value || '#ffffff'}
                              </span>
                            </div>
                            <FormControl>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="color"
                                  value={field.value || '#ffffff'}
                                  onChange={(e) =>
                                    setValue('secondaryMessageTextColor', e.target.value)
                                  }
                                  className="h-10 w-14 cursor-pointer p-1"
                                />
                                <Input
                                  type="text"
                                  value={field.value || '#ffffff'}
                                  onChange={(e) =>
                                    setValue('secondaryMessageTextColor', e.target.value)
                                  }
                                  placeholder="#ffffff"
                                  className="flex-1 font-mono"
                                  maxLength={7}
                                />
                              </div>
                            </FormControl>
                            <FormDescription>
                              Choose the text color for the secondary message
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Secondary Message Text Shadow */}
                      <FormField
                        control={control}
                        name="secondaryMessageTextShadow"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <div className="space-y-0.5">
                              <FormLabel>Text Shadow</FormLabel>
                              <FormDescription>
                                Add a shadow behind the text for better readability
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                name={field.name}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      {/* Secondary Message Text Shadow Darkness - only show when shadow is enabled */}
                      {form.watch('secondaryMessageTextShadow') && (
                        <FormField
                          control={control}
                          name="secondaryMessageTextShadowDarkness"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between">
                                <FormLabel>Shadow Darkness</FormLabel>
                                <span className="text-sm text-muted-foreground">
                                  {field.value?.toFixed(0) ?? '50'}%
                                </span>
                              </div>
                              <FormControl>
                                <Slider
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={[field.value ?? 50]}
                                  onValueChange={(values) =>
                                    setValue('secondaryMessageTextShadowDarkness', values[0])
                                  }
                                />
                              </FormControl>
                              <FormDescription>
                                0% = light shadow, 100% = dark shadow
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* Link Settings */}
              <FormField
                control={control}
                name="linkUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Link URL (Optional)</FormLabel>
                    <FormControl>
                      <Input type="url" placeholder="https://example.com/page" {...field} />
                    </FormControl>
                    <FormDescription>
                      If provided, the entire banner becomes clickable.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator />

              {/* Display Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Display Settings</h3>

                <FormField
                  control={control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormDescription>Only active banners are displayed.</FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          name={field.name}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormItem className="flex flex-col">
                    <FormLabel>Display From</FormLabel>
                    <DatePicker fieldName="displayFrom" onSelect={handleDateSelect} />
                    <FormDescription>When the banner should start displaying.</FormDescription>
                    <FormMessage />
                  </FormItem>

                  <FormItem className="flex flex-col">
                    <FormLabel>Display Until</FormLabel>
                    <DatePicker fieldName="displayUntil" onSelect={handleDateSelect} />
                    <FormDescription>When the banner should stop displaying.</FormDescription>
                    <FormMessage />
                  </FormItem>
                </div>
              </div>

              <Separator />

              {/* Internal Notes */}
              <FormField
                control={control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Internal Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Notes for admins - not displayed publicly..."
                        className="min-h-20"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Internal notes about this banner. Not visible to users.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Preview */}
              {(watchedImageUrl || watchedBackgroundColor) && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Preview</h3>
                    <p className="text-sm text-muted-foreground">
                      Drag the text to position it. Use the rotation handle (↻) to rotate. Click the
                      preview and use arrow keys to nudge the image (hold Shift for larger
                      increments).
                    </p>
                    <div
                      ref={previewContainerRef}
                      className="relative w-full overflow-hidden rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary"
                      style={{
                        paddingBottom: `${100 / 1.618}%`,
                        cursor:
                          isDraggingMessage ||
                          isDraggingSecondary ||
                          isRotatingMessage ||
                          isRotatingSecondary
                            ? 'grabbing'
                            : 'default',
                      }}
                      tabIndex={0}
                      onKeyDown={handlePreviewKeyDown}
                    >
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundColor: !(
                            originalPreviewUrl ||
                            watchedOriginalImageUrl ||
                            watchedImageUrl
                          )
                            ? watchedBackgroundColor
                            : undefined,
                          backgroundImage:
                            originalPreviewUrl || watchedOriginalImageUrl || watchedImageUrl
                              ? `url(${originalPreviewUrl || watchedOriginalImageUrl || watchedImageUrl})`
                              : undefined,
                          backgroundSize: 'cover',
                          backgroundPosition: `calc(50% + ${watchedImageOffsetX ?? 0}%) calc(50% + ${watchedImageOffsetY ?? 0}%)`,
                        }}
                        onClick={() => setSelectedTextBox(null)}
                      >
                        {watchedIsOverlayed && (
                          <>
                            {/* Message - draggable, rotatable, resizable, and positioned */}
                            <ResizableTextBox
                              width={watchedMessageWidth ?? 80}
                              height={watchedMessageHeight ?? 30}
                              onWidthChange={(w: number) => setValue('messageWidth', w)}
                              onHeightChange={(h: number) => setValue('messageHeight', h)}
                              positionX={watchedMessagePositionX ?? 50}
                              positionY={watchedMessagePositionY ?? 10}
                              rotation={watchedMessageRotation ?? 0}
                              isDragging={isDraggingMessage}
                              onDragStart={handleMessageDragStart}
                              onRotateStart={handleMessageRotateStart}
                              isSelected={selectedTextBox === 'message'}
                              onSelect={() => setSelectedTextBox('message')}
                              onDoubleClick={() => {
                                messageTextareaRef.current?.focus();
                                messageTextareaRef.current?.scrollIntoView({
                                  behavior: 'smooth',
                                  block: 'center',
                                });
                              }}
                              title="Drag to position, double-click to edit, drag handles to resize"
                              textStyle={{
                                fontFamily:
                                  watchedMessageFont === 'system-ui'
                                    ? "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                                    : `'${watchedMessageFont}', system-ui, sans-serif`,
                                fontSize: `${watchedMessageFontSize}rem`,
                                color: hexToRgba(
                                  watchedMessageTextColor || '#ffffff',
                                  (watchedMessageContrast ?? 100) / 100
                                ),
                                textShadow:
                                  watchedMessageTextShadow &&
                                  (originalPreviewUrl || watchedOriginalImageUrl || watchedImageUrl)
                                    ? `0 1px 2px rgba(0,0,0,${0.3 + ((watchedMessageTextShadowDarkness ?? 50) / 100) * 0.6})`
                                    : 'none',
                                textTransform: 'none',
                                letterSpacing: 'normal',
                                fontWeight: 'normal',
                              }}
                            >
                              {watchedMessage || 'Your message here'}
                            </ResizableTextBox>
                            {/* Secondary message - draggable, rotatable, resizable, and positioned */}
                            {watchedSecondaryMessage && (
                              <ResizableTextBox
                                width={watchedSecondaryMessageWidth ?? 80}
                                height={watchedSecondaryMessageHeight ?? 30}
                                onWidthChange={(w: number) => setValue('secondaryMessageWidth', w)}
                                onHeightChange={(h: number) =>
                                  setValue('secondaryMessageHeight', h)
                                }
                                positionX={watchedSecondaryMessagePositionX ?? 50}
                                positionY={watchedSecondaryMessagePositionY ?? 90}
                                rotation={watchedSecondaryMessageRotation ?? 0}
                                isDragging={isDraggingSecondary}
                                onDragStart={handleSecondaryDragStart}
                                onRotateStart={handleSecondaryRotateStart}
                                isSelected={selectedTextBox === 'secondary'}
                                onSelect={() => setSelectedTextBox('secondary')}
                                onDoubleClick={() => {
                                  secondaryMessageTextareaRef.current?.focus();
                                  secondaryMessageTextareaRef.current?.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'center',
                                  });
                                }}
                                title="Drag to position, double-click to edit, drag handles to resize"
                                textStyle={{
                                  fontFamily:
                                    watchedSecondaryMessageFont === 'system-ui'
                                      ? "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                                      : `'${watchedSecondaryMessageFont}', system-ui, sans-serif`,
                                  fontSize: `${watchedSecondaryMessageFontSize}rem`,
                                  color: hexToRgba(
                                    watchedSecondaryMessageTextColor || '#ffffff',
                                    (watchedSecondaryMessageContrast ?? 95) / 100
                                  ),
                                  textShadow:
                                    watchedSecondaryMessageTextShadow &&
                                    (originalPreviewUrl ||
                                      watchedOriginalImageUrl ||
                                      watchedImageUrl)
                                      ? `0 1px 2px rgba(0,0,0,${0.3 + ((watchedSecondaryMessageTextShadowDarkness ?? 50) / 100) * 0.6})`
                                      : 'none',
                                  textTransform: 'none',
                                  letterSpacing: 'normal',
                                  fontWeight: 'normal',
                                }}
                              >
                                {watchedSecondaryMessage}
                              </ResizableTextBox>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {/* Position, rotation, and dimensions display */}
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>
                        Message: X={watchedMessagePositionX ?? 50}%, Y=
                        {watchedMessagePositionY ?? 10}%, W={watchedMessageWidth ?? 80}%, H=
                        {watchedMessageHeight ?? 30}%, Rotation={watchedMessageRotation ?? 0}°
                      </span>
                      {watchedSecondaryMessage && (
                        <span>
                          Secondary: X={watchedSecondaryMessagePositionX ?? 50}%, Y=
                          {watchedSecondaryMessagePositionY ?? 90}%, W=
                          {watchedSecondaryMessageWidth ?? 80}%, H=
                          {watchedSecondaryMessageHeight ?? 30}%, Rotation=
                          {watchedSecondaryMessageRotation ?? 0}°
                        </span>
                      )}
                      {(originalPreviewUrl || watchedOriginalImageUrl || watchedImageUrl) && (
                        <span>
                          Image offset: X={watchedImageOffsetX ?? 0}%, Y={watchedImageOffsetY ?? 0}%
                        </span>
                      )}
                    </div>
                    {/* Selection hint */}
                    <p className="text-xs text-muted-foreground">
                      Click a text box to select it and see resize handles. Drag handles to resize.
                    </p>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button type="button" variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? 'Saving...'
                  : isEditMode
                    ? 'Save Changes'
                    : 'Create Notification Banner'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>

      {/* Image Cropper Dialog */}
      <ImageCropper
        imageSrc={imageToCrop}
        open={cropperOpen}
        onOpenChange={setCropperOpen}
        onCropComplete={handleCropComplete}
        initialBackgroundColor={watchedBackgroundColor}
      />
    </div>
  );
}
