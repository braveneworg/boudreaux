/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { PutObjectCommand, S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import type { Group } from '@/lib/types/media-models';

import type { ServiceResponse } from './service.types';

/**
 * Input data for uploading an image
 */
export interface ImageUploadInput {
  file: Buffer;
  fileName: string;
  contentType: string;
  caption?: string;
  altText?: string;
}

/**
 * Result of an image upload operation
 */
export interface ImageUploadResult {
  id: string;
  src: string;
  caption?: string;
  altText?: string;
  sortOrder: number;
}

/**
 * S3 client configuration
 */
const getS3Client = () => {
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });
};

/**
 * Generate a unique file key for S3
 */
const generateS3Key = (groupId: string, fileName: string): string => {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  const sanitizedName = fileName
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .substring(0, 50);

  return `media/groups/${groupId}/${sanitizedName}-${timestamp}-${randomSuffix}.${extension}`;
};

export class GroupService {
  /**
   * Create a new group
   */
  static async createGroup(data: Prisma.GroupCreateInput): Promise<ServiceResponse<Group>> {
    try {
      const group = await prisma.group.create({
        data,
        include: {
          images: true,
          artistGroups: true,
          urls: true,
        },
      });
      return { success: true, data: group as unknown as Group };
    } catch (error) {
      // Unique constraint violations
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { success: false, error: 'Group with this name already exists' };
      }

      // Connection/network issues
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      // Unknown errors
      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to create group' };
    }
  }

  /**
   * Get a group by ID
   */
  static async getGroupById(id: string): Promise<ServiceResponse<Group>> {
    try {
      const group = await prisma.group.findUnique({
        where: { id },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
          },
          artistGroups: {
            include: {
              artist: {
                select: {
                  id: true,
                  firstName: true,
                  surname: true,
                  displayName: true,
                  images: {
                    orderBy: { sortOrder: 'asc' },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });

      if (!group) {
        return { success: false, error: 'Group not found' };
      }

      return { success: true, data: group as unknown as Group };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve group' };
    }
  }

  /**
   * Get all groups with optional filters
   */
  static async getGroups(params?: {
    skip?: number;
    take?: number;
    search?: string;
  }): Promise<ServiceResponse<Group[]>> {
    try {
      const { skip = 0, take = 50, search } = params || {};

      const where: Prisma.GroupWhereInput = {
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { displayName: { contains: search, mode: 'insensitive' } },
          ],
        }),
      };

      const groups = await prisma.group.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          images: {
            orderBy: { sortOrder: 'asc' },
            take: 3,
          },
          artistGroups: {
            include: {
              artist: {
                select: {
                  id: true,
                  firstName: true,
                  surname: true,
                  displayName: true,
                },
              },
            },
          },
        },
      });

      return { success: true, data: groups as unknown as Group[] };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to retrieve groups' };
    }
  }

  /**
   * Update a group by ID
   */
  static async updateGroup(
    id: string,
    data: Prisma.GroupUpdateInput
  ): Promise<ServiceResponse<Group>> {
    try {
      const group = await prisma.group.update({
        where: { id },
        data,
      });

      return { success: true, data: group as unknown as Group };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Group not found' };
      }

      // Unique constraint violations
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { success: false, error: 'Group with this name already exists' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to update group' };
    }
  }

  /**
   * Delete a group by ID (hard delete)
   */
  static async deleteGroup(id: string): Promise<ServiceResponse<Group>> {
    try {
      const group = await prisma.group.delete({
        where: { id },
      });

      return { success: true, data: group as unknown as Group };
    } catch (error) {
      // Record not found
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Group not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Unexpected error:', error);
      return { success: false, error: 'Failed to delete group' };
    }
  }

  /**
   * Upload images for a group
   */
  static async uploadGroupImages(
    groupId: string,
    images: ImageUploadInput[]
  ): Promise<ServiceResponse<ImageUploadResult[]>> {
    try {
      // Verify group exists
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true },
      });

      if (!group) {
        return { success: false, error: 'Group not found' };
      }

      // Get current max sort order
      const maxSortOrderResult = await prisma.image.aggregate({
        where: { groupId },
        _max: { sortOrder: true },
      });
      let currentSortOrder = (maxSortOrderResult._max.sortOrder ?? -1) + 1;

      const s3Client = getS3Client();
      const bucket = process.env.AWS_S3_BUCKET_NAME;
      const cdnDomainRaw = process.env.AWS_CLOUDFRONT_DOMAIN;
      // Strip any existing protocol from CDN domain to avoid double https://
      const cdnDomain = cdnDomainRaw?.replace(/^https?:\/\//, '');

      if (!bucket) {
        return { success: false, error: 'S3 bucket not configured' };
      }

      const uploadedImages: ImageUploadResult[] = [];

      for (const image of images) {
        const key = generateS3Key(groupId, image.fileName);

        // Upload to S3
        const putCommand = new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: image.file,
          ContentType: image.contentType,
          CacheControl: 'max-age=31536000',
        });

        await s3Client.send(putCommand);

        // Generate URL (prefer CloudFront, fallback to S3)
        const imageUrl = cdnDomain
          ? `https://${cdnDomain}/${key}`
          : `https://${bucket}.s3.amazonaws.com/${key}`;

        // Create image record in database
        const imageRecord = await prisma.image.create({
          data: {
            groupId,
            src: imageUrl,
            caption: image.caption,
            altText: image.altText,
            sortOrder: currentSortOrder++,
          },
        });

        uploadedImages.push({
          id: imageRecord.id,
          src: imageRecord.src || '',
          caption: imageRecord.caption || undefined,
          altText: imageRecord.altText || undefined,
          sortOrder: imageRecord.sortOrder,
        });
      }

      return { success: true, data: uploadedImages };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Image upload error:', error);
      return { success: false, error: 'Failed to upload images' };
    }
  }

  /**
   * Delete a group image
   */
  static async deleteGroupImage(imageId: string): Promise<ServiceResponse<{ deleted: boolean }>> {
    try {
      // Get image to find S3 key
      const image = await prisma.image.findUnique({
        where: { id: imageId },
        select: { id: true, src: true, groupId: true },
      });

      if (!image) {
        return { success: false, error: 'Image not found' };
      }

      if (!image.groupId) {
        return { success: false, error: 'Image does not belong to a group' };
      }

      // Extract S3 key from URL
      if (image.src) {
        const cdnDomainRaw = process.env.AWS_CLOUDFRONT_DOMAIN;
        // Strip any existing protocol from CDN domain
        const cdnDomain = cdnDomainRaw?.replace(/^https?:\/\//, '');
        const bucket = process.env.AWS_S3_BUCKET_NAME;
        let key: string | null = null;

        if (cdnDomain && image.src.includes(cdnDomain)) {
          // Extract key from CDN URL (handles both correct and malformed URLs with double https://)
          key = image.src.replace(/^(https?:\/\/)+/, '').replace(`${cdnDomain}/`, '');
        } else if (bucket && image.src.includes(bucket)) {
          key = image.src.replace(/^(https?:\/\/)+/, '').replace(`${bucket}.s3.amazonaws.com/`, '');
        }

        if (key) {
          const s3Client = getS3Client();
          const deleteCommand = new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
          });
          await s3Client.send(deleteCommand);
        }
      }

      // Delete from database
      await prisma.image.delete({
        where: { id: imageId },
      });

      return { success: true, data: { deleted: true } };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Image not found' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Delete image error:', error);
      return { success: false, error: 'Failed to delete image' };
    }
  }

  /**
   * Reorder group images
   */
  static async reorderGroupImages(
    groupId: string,
    imageIds: string[]
  ): Promise<ServiceResponse<ImageUploadResult[]>> {
    try {
      // Verify all images belong to the group
      const existingImages = await prisma.image.findMany({
        where: { groupId, id: { in: imageIds } },
        select: { id: true },
      });

      if (existingImages.length !== imageIds.length) {
        return { success: false, error: 'Some images not found or do not belong to this group' };
      }

      // Update sort order for each image
      const updatePromises = imageIds.map((id, index) =>
        prisma.image.update({
          where: { id },
          data: { sortOrder: index } as Prisma.ImageUpdateInput,
        })
      );

      await Promise.all(updatePromises);

      // Fetch updated images in new order
      const updatedImages = await prisma.image.findMany({
        where: { groupId },
        orderBy: { sortOrder: 'asc' } as Prisma.ImageOrderByWithRelationInput,
      });

      return {
        success: true,
        data: updatedImages.map((img) => ({
          id: img.id,
          src: img.src || '',
          caption: img.caption || undefined,
          altText: img.altText || undefined,
          sortOrder: (img as { sortOrder?: number }).sortOrder ?? 0,
        })),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Reorder images error:', error);
      return { success: false, error: 'Failed to reorder images' };
    }
  }

  /**
   * Add an artist to a group
   */
  static async addGroupMember(
    groupId: string,
    artistId: string
  ): Promise<ServiceResponse<{ id: string; artistId: string; groupId: string }>> {
    try {
      // Verify group exists
      const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true },
      });

      if (!group) {
        return { success: false, error: 'Group not found' };
      }

      // Verify artist exists
      const artist = await prisma.artist.findUnique({
        where: { id: artistId },
        select: { id: true },
      });

      if (!artist) {
        return { success: false, error: 'Artist not found' };
      }

      // Check if already a member
      const existingMember = await prisma.artistGroup.findUnique({
        where: {
          artistId_groupId: { artistId, groupId },
        },
      });

      if (existingMember) {
        return { success: false, error: 'Artist is already a member of this group' };
      }

      // Create the membership
      const membership = await prisma.artistGroup.create({
        data: {
          artistId,
          groupId,
        },
      });

      return { success: true, data: membership };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Add group member error:', error);
      return { success: false, error: 'Failed to add artist to group' };
    }
  }

  /**
   * Remove an artist from a group
   */
  static async removeGroupMember(
    groupId: string,
    artistId: string
  ): Promise<ServiceResponse<{ id: string }>> {
    try {
      // Find and delete the membership
      const membership = await prisma.artistGroup.delete({
        where: {
          artistId_groupId: { artistId, groupId },
        },
      });

      return { success: true, data: { id: membership.id } };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { success: false, error: 'Artist is not a member of this group' };
      }

      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Remove group member error:', error);
      return { success: false, error: 'Failed to remove artist from group' };
    }
  }

  /**
   * Get all members of a group
   */
  static async getGroupMembers(groupId: string): Promise<
    ServiceResponse<
      Array<{
        id: string;
        artistId: string;
        artist: {
          id: string;
          firstName: string;
          surname: string;
          displayName: string | null;
        };
      }>
    >
  > {
    try {
      const members = await prisma.artistGroup.findMany({
        where: { groupId },
        include: {
          artist: {
            select: {
              id: true,
              firstName: true,
              surname: true,
              displayName: true,
            },
          },
        },
      });

      return { success: true, data: members };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientInitializationError) {
        console.error('Database connection failed:', error);
        return { success: false, error: 'Database unavailable' };
      }

      console.error('Get group members error:', error);
      return { success: false, error: 'Failed to get group members' };
    }
  }
}
