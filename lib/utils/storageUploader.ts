import { createClient } from '@/lib/supabase/client';
import {
  compressImage,
  generateThumbnail,
  IMAGE_MAX_DIMENSIONS,
  IMAGE_COMPRESSION_QUALITY,
  CompressionOptions,
} from './imageCompressor';

export type StudioAssetFolder = 'artists' | 'flash' | 'portfolio';

export interface StudioImageUploadResult {
  path: string;
  publicUrl: string;
  thumbnailPath?: string;
  thumbnailUrl?: string;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
  thumbnailSize?: number;
}

export interface CustomerReferenceUploadResult {
  path: string;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
}

export interface UploadOptions {
  maxDimension?: number;
  quality?: number;
  outputFormat?: 'image/webp' | 'image/jpeg' | 'image/png';
}

const CLIENT_MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB for Studio Assets (artists, flash, portfolio) before client resize
const CUSTOMER_REF_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB for Customer References
const PAYMENT_SLIP_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB for Payment Slips before client resize
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

/**
 * Validates file size and MIME type before compression and upload.
 */
export function validateImageFile(file: File, maxSize: number = CLIENT_MAX_FILE_SIZE): void {
  if (!file) {
    throw new Error('ไม่พบไฟล์รูปภาพ กรุณาเลือกไฟล์');
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    throw new Error('รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WEBP เท่านั้น');
  }

  if (file.size > maxSize) {
    const sizeInMb = Math.round(maxSize / (1024 * 1024));
    throw new Error(`ไฟล์รูปภาพต้องมีขนาดไม่เกิน ${sizeInMb} MB`);
  }
}

/**
 * Helper to generate a secure UUID filename preserving the target extension.
 */
function generateUuidFilename(file: File): string {
  const ext = file.name.substring(file.name.lastIndexOf('.')) || (file.type === 'image/webp' ? '.webp' : file.type === 'image/png' ? '.png' : '.jpg');
  const cleanExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  const uuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  return `${uuid}${cleanExt}`;
}

/**
 * Uploads a public business asset to the 'studio-assets' bucket under the specified folder.
 * Folders: 'artists', 'flash', 'portfolio'
 * 
 * Size Standards:
 * - Portfolio: max 2200 px, quality 0.82
 * - Flash: max 2200 px, quality 0.82
 * - Artists (Avatar): max 1000 px, quality 0.82
 * - Thumbnail (Portfolio & Flash): max 480 px, quality 0.78
 */
export async function uploadStudioImage(
  file: File,
  folder: StudioAssetFolder,
  options: UploadOptions = {}
): Promise<StudioImageUploadResult> {
  const allowedFolders: StudioAssetFolder[] = ['artists', 'flash', 'portfolio'];
  if (!allowedFolders.includes(folder)) {
    throw new Error(`โฟลเดอร์ไม่ถูกต้อง ต้องเป็น ${allowedFolders.join(', ')} เท่านั้น`);
  }

  // 1. Validate file size and MIME
  validateImageFile(file, CLIENT_MAX_FILE_SIZE);

  const originalSize = file.size;

  // 2. Determine standard maxDimension and quality based on asset folder
  let defaultMaxDimension: number = IMAGE_MAX_DIMENSIONS.PORTFOLIO;
  let defaultQuality: number = IMAGE_COMPRESSION_QUALITY.DEFAULT;

  if (folder === 'artists') {
    defaultMaxDimension = IMAGE_MAX_DIMENSIONS.ARTIST_AVATAR; // max 1000 px
    defaultQuality = IMAGE_COMPRESSION_QUALITY.ARTIST_AVATAR; // quality 0.82
  } else if (folder === 'flash') {
    defaultMaxDimension = IMAGE_MAX_DIMENSIONS.FLASH; // max 2200 px
    defaultQuality = IMAGE_COMPRESSION_QUALITY.FLASH; // quality 0.82
  } else if (folder === 'portfolio') {
    defaultMaxDimension = IMAGE_MAX_DIMENSIONS.PORTFOLIO; // max 2200 px
    defaultQuality = IMAGE_COMPRESSION_QUALITY.PORTFOLIO; // quality 0.82
  }

  const compressionOptions: CompressionOptions = {
    maxDimension: options.maxDimension ?? defaultMaxDimension,
    quality: options.quality ?? defaultQuality,
    outputFormat: options.outputFormat,
  };

  // 3. Compress & resize image client-side preserving 1:1 original aspect ratio without upscaling
  const compressedFile = await compressImage(file, compressionOptions);
  const compressedSize = compressedFile.size;

  // 4. Generate UUID filename
  const filename = generateUuidFilename(compressedFile);
  const storagePath = `${folder}/${filename}`;

  // 5. Upload to studio-assets bucket using authenticated client (RLS: Admin/Artist)
  const supabase = createClient();
  const { error: uploadError } = await supabase.storage
    .from('studio-assets')
    .upload(storagePath, compressedFile, {
      cacheControl: '31536000', // 1 year cache for static assets with UUID
      upsert: false,
    });

  if (uploadError) {
    console.error('[storageUploader] Studio upload failed:', uploadError);
    throw new Error(`อัปโหลดรูปภาพไม่สำเร็จ: ${uploadError.message}`);
  }

  // 6. Retrieve public URL
  const { data: publicUrlData } = supabase.storage
    .from('studio-assets')
    .getPublicUrl(storagePath);

  let thumbnailPath: string | undefined = undefined;
  let thumbnailUrl: string | undefined = undefined;
  let thumbnailSize: number | undefined = undefined;

  // 7. Generate & upload Thumbnail for 'flash' and 'portfolio' assets (constrained to 480px WebP)
  if (folder === 'flash' || folder === 'portfolio') {
    try {
      const thumbFile = await generateThumbnail(compressedFile, IMAGE_MAX_DIMENSIONS.THUMBNAIL, options);
      thumbnailSize = thumbFile.size;
      const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;
      const thumbFilename = `thumb_${baseName}.webp`;
      thumbnailPath = `${folder}/${thumbFilename}`;

      const { error: thumbUploadErr } = await supabase.storage
        .from('studio-assets')
        .upload(thumbnailPath, thumbFile, {
          cacheControl: '31536000',
          upsert: false,
        });

      if (!thumbUploadErr) {
        const { data: thumbUrlData } = supabase.storage
          .from('studio-assets')
          .getPublicUrl(thumbnailPath);
        thumbnailUrl = thumbUrlData.publicUrl;
      } else {
        console.warn('[storageUploader] Thumbnail upload warning:', thumbUploadErr.message);
      }
    } catch (err) {
      console.warn('[storageUploader] Could not generate thumbnail during upload:', err);
    }
  }

  return {
    path: storagePath,
    publicUrl: publicUrlData.publicUrl,
    thumbnailPath,
    thumbnailUrl,
    mimeType: compressedFile.type,
    originalSize,
    compressedSize,
    thumbnailSize,
  };
}

/**
 * Uploads a customer tattoo reference image to the private 'customer-references' bucket.
 * Canonical path: <auth.uid()>/<uuid>.<ext>
 * 
 * Size Standard:
 * - Customer reference images: max 1800 px, quality 0.82
 */
export async function uploadCustomerReference(
  file: File,
  options: UploadOptions = {}
): Promise<CustomerReferenceUploadResult> {
  const supabase = createClient();

  // 1. Verify authenticated customer session (derive user ID internally)
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    throw new Error('กรุณาเข้าสู่ระบบก่อนอัปโหลดรูปภาพอ้างอิง');
  }

  // 2. Validate file size and MIME (up to 10 MB for Customer References)
  validateImageFile(file, CUSTOMER_REF_MAX_FILE_SIZE);

  const originalSize = file.size;

  // 3. Compress & resize customer reference: max 1800 px, quality 0.82
  const compressionOptions: CompressionOptions = {
    maxDimension: options.maxDimension ?? IMAGE_MAX_DIMENSIONS.CUSTOMER_REFERENCE, // max 1800 px
    quality: options.quality ?? IMAGE_COMPRESSION_QUALITY.CUSTOMER_REFERENCE, // quality 0.82
    outputFormat: options.outputFormat,
  };

  const compressedFile = await compressImage(file, compressionOptions);
  const compressedSize = compressedFile.size;

  // 4. Generate UUID filename & construct user-isolated path
  const filename = generateUuidFilename(compressedFile);
  const storagePath = `${user.id}/${filename}`;

  // 5. Upload to customer-references bucket (RLS: own folder only)
  const { error: uploadError } = await supabase.storage
    .from('customer-references')
    .upload(storagePath, compressedFile, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('[storageUploader] Customer reference upload failed:', uploadError);
    throw new Error(`อัปโหลดรูปภาพอ้างอิงไม่สำเร็จ: ${uploadError.message}`);
  }

  return {
    path: storagePath,
    mimeType: compressedFile.type,
    originalSize,
    compressedSize,
  };
}

/**
 * Compresses and resizes a payment slip image according to the 157 Tattoo standard:
 * - Max dimension: 1400 px (longest side, no upscale, preserve aspect ratio)
 * - Quality: 0.85 (balanced to ensure numbers/text on slip are razor-sharp)
 */
export async function compressPaymentSlip(
  file: File,
  options: UploadOptions = {}
): Promise<File> {
  validateImageFile(file, PAYMENT_SLIP_MAX_FILE_SIZE);
  return compressImage(file, {
    maxDimension: options.maxDimension ?? IMAGE_MAX_DIMENSIONS.PAYMENT_SLIP, // max 1400 px
    quality: options.quality ?? IMAGE_COMPRESSION_QUALITY.PAYMENT_SLIP, // quality 0.85
    outputFormat: options.outputFormat,
  });
}

/**
 * Generates a temporary Signed URL to display a private customer reference image.
 * Expiry default: 3600 seconds (1 hour).
 */
export async function getCustomerReferenceSignedUrl(
  path: string,
  expiresIn: number = 3600
): Promise<string> {
  if (!path) return '';

  // If already a full HTTP/HTTPS URL (e.g. legacy external/test URL) or Data URL, return as-is
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }

  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from('customer-references')
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    console.error('[storageUploader] Signed URL creation failed:', error?.message || 'unknown error');
    return '';
  }

  return data.signedUrl;
}

/**
 * Batch generates temporary Signed URLs for an array of customer reference image paths.
 */
export async function getCustomerReferenceSignedUrls(
  paths: string[],
  expiresIn: number = 3600
): Promise<string[]> {
  if (!paths || paths.length === 0) return [];

  const promises = paths.map((p) => getCustomerReferenceSignedUrl(p, expiresIn));
  const results = await Promise.all(promises);
  return results.filter(Boolean);
}

/**
 * Extracts relative storage path within 'studio-assets' bucket from a full URL or partial path.
 * Examples:
 *   "https://xyz.supabase.co/storage/v1/object/public/studio-assets/portfolio/abc.webp" -> "portfolio/abc.webp"
 *   "https://xyz.supabase.co/storage/v1/object/public/studio-assets/flash/xyz.webp" -> "flash/xyz.webp"
 *   "portfolio/abc.webp" -> "portfolio/abc.webp"
 *   "flash/xyz.webp" -> "flash/xyz.webp"
 */
export function extractStudioStoragePath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath || typeof urlOrPath !== 'string') return null;
  const trimmed = urlOrPath.trim();
  if (!trimmed) return null;

  const bucketMarker = '/studio-assets/';
  const idx = trimmed.indexOf(bucketMarker);
  if (idx !== -1) {
    const extracted = trimmed.substring(idx + bucketMarker.length).split('?')[0];
    return decodeURIComponent(extracted).replace(/^\/+/, '');
  }

  if (trimmed.startsWith('studio-assets/')) {
    return trimmed.substring('studio-assets/'.length).split('?')[0];
  }

  const validFolders = ['portfolio/', 'flash/', 'artists/'];
  for (const folder of validFolders) {
    const fIdx = trimmed.indexOf(folder);
    if (fIdx !== -1) {
      return trimmed.substring(fIdx).split('?')[0];
    }
  }

  if (!trimmed.includes('://') && !trimmed.startsWith('/')) {
    return trimmed.split('?')[0];
  }

  return null;
}

/**
 * Derives the expected thumbnail path (e.g. portfolio/thumb_baseName.webp) from a main image path or URL.
 */
export function getStudioThumbnailStoragePath(urlOrPath: string | null | undefined): string | null {
  const mainPath = extractStudioStoragePath(urlOrPath);
  if (!mainPath) return null;

  const parts = mainPath.split('/');
  if (parts.length < 2) return null;

  const folder = parts.slice(0, -1).join('/');
  const filename = parts[parts.length - 1];

  if (filename.startsWith('thumb_')) {
    return mainPath;
  }

  const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;
  return `${folder}/thumb_${baseName}.webp`;
}

/**
 * Deletes studio assets (main image + derived thumbnail) from 'studio-assets' bucket.
 * Returns an object with the list of requested paths and any error message.
 */
export async function deleteStudioAssets(
  pathsOrUrls: (string | null | undefined)[],
  supabaseClient?: any
): Promise<{ paths: string[]; error: string | null }> {
  const pathsToDelete: string[] = [];

  for (const item of pathsOrUrls) {
    if (!item) continue;
    const mainPath = extractStudioStoragePath(item);
    if (mainPath && !pathsToDelete.includes(mainPath)) {
      pathsToDelete.push(mainPath);
    }
    const thumbPath = getStudioThumbnailStoragePath(item);
    if (thumbPath && !pathsToDelete.includes(thumbPath)) {
      pathsToDelete.push(thumbPath);
    }
  }

  if (pathsToDelete.length === 0) {
    return { paths: [], error: null };
  }

  try {
    const supabase = supabaseClient || createClient();
    const { error } = await supabase.storage
      .from('studio-assets')
      .remove(pathsToDelete);

    if (error) {
      console.warn('[storageUploader] deleteStudioAssets warning:', error);
      return { paths: pathsToDelete, error: error.message };
    }

    return { paths: pathsToDelete, error: null };
  } catch (err: any) {
    console.warn('[storageUploader] deleteStudioAssets exception:', err);
    return { paths: pathsToDelete, error: err?.message || 'Storage cleanup failed' };
  }
}
