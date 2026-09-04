import { createClient } from '@/lib/supabase/client';
import { compressImage } from './imageCompressor';

export type StudioAssetFolder = 'artists' | 'flash' | 'portfolio';

export interface StudioImageUploadResult {
  path: string;
  publicUrl: string;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
}

export interface CustomerReferenceUploadResult {
  path: string;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
}

export interface UploadOptions {
  quality?: number;
  outputFormat?: 'image/webp' | 'image/jpeg' | 'image/png';
}

const CLIENT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
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

  // 2. Compress image client-side preserving 1:1 original pixel dimensions
  const compressedFile = await compressImage(file, options);
  const compressedSize = compressedFile.size;

  // 3. Generate UUID filename
  const filename = generateUuidFilename(compressedFile);
  const storagePath = `${folder}/${filename}`;

  // 4. Upload to studio-assets bucket using authenticated client (RLS: Admin only)
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

  // 5. Retrieve public URL
  const { data: publicUrlData } = supabase.storage
    .from('studio-assets')
    .getPublicUrl(storagePath);

  return {
    path: storagePath,
    publicUrl: publicUrlData.publicUrl,
    mimeType: compressedFile.type,
    originalSize,
    compressedSize,
  };
}

/**
 * Uploads a customer tattoo reference image to the private 'customer-references' bucket.
 * Canonical path: <auth.uid()>/<uuid>.<ext>
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

  // 2. Validate file size and MIME
  validateImageFile(file, CLIENT_MAX_FILE_SIZE);

  const originalSize = file.size;

  // 3. Compress image client-side
  const compressedFile = await compressImage(file, options);
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
