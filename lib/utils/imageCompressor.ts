/**
 * 157 TATTOO — Global Client-Side Image Compression & Resizing Utility
 * 
 * Standard Dimensions (Longest Side):
 * - Portfolio images: max 2200 px, quality 0.82
 * - Flash design images: max 2200 px, quality 0.82
 * - Customer reference images: max 1800 px, quality 0.82
 * - Artist avatar/profile images: max 1000 px, quality 0.82
 * - Payment slip images: max 1400 px, quality 0.85 (ensures bank digits/text remain clear)
 * - Thumbnails: max 480 px, quality 0.78
 * 
 * Rules:
 * 1. Resizes image constrained to maxDimension (longest side) only when image is larger than maxDimension.
 * 2. Strictly preserves original aspect ratio (100%), orientation, and alpha transparency.
 * 3. Never upscales smaller images.
 * 4. Compresses file size using WebP or JPEG based on format.
 * 5. Returns a standard File object ready for Supabase Storage.
 */

export const IMAGE_MAX_DIMENSIONS = {
  PORTFOLIO: 2200,
  FLASH: 2200,
  CUSTOMER_REFERENCE: 1800,
  ARTIST_AVATAR: 1000,
  PAYMENT_SLIP: 1400,
  THUMBNAIL: 480,
} as const;

export const IMAGE_COMPRESSION_QUALITY = {
  DEFAULT: 0.82,
  PORTFOLIO: 0.82,
  FLASH: 0.82,
  CUSTOMER_REFERENCE: 0.82,
  ARTIST_AVATAR: 0.82,
  PAYMENT_SLIP: 0.85,
  THUMBNAIL: 0.78,
} as const;

export interface CompressionOptions {
  maxDimension?: number;
  quality?: number;
  outputFormat?: 'image/webp' | 'image/jpeg' | 'image/png';
}

export interface CompressionResult {
  file: File;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
}

/**
 * Compresses and resizes an image File in the browser according to the 157 Tattoo standard.
 * Strictly preserves aspect ratio, orientation, and avoids upscaling.
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const quality = options.quality ?? IMAGE_COMPRESSION_QUALITY.DEFAULT;
  const maxDimension = options.maxDimension;

  // Validate MIME type
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (!validTypes.includes(file.type.toLowerCase())) {
    throw new Error('รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP');
  }

  return new Promise<File>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('ไม่สามารถประมวลผลรูปภาพได้ กรุณาลองใหม่'));
    };

    reader.onload = () => {
      const img = new Image();

      img.onerror = () => {
        reject(new Error('ไม่สามารถประมวลผลรูปภาพได้ กรุณาลองใหม่'));
      };

      img.onload = () => {
        try {
          const originalWidth = img.naturalWidth || img.width;
          const originalHeight = img.naturalHeight || img.height;

          if (!originalWidth || !originalHeight) {
            throw new Error('ไม่สามารถอ่านขนาดรูปภาพได้');
          }

          // Compute target dimensions:
          // Strictly preserve aspect ratio, no crop, no stretch, no upscale
          let targetWidth = originalWidth;
          let targetHeight = originalHeight;

          if (maxDimension && (originalWidth > maxDimension || originalHeight > maxDimension)) {
            const ratio = Math.min(maxDimension / originalWidth, maxDimension / originalHeight);
            targetWidth = Math.round(originalWidth * ratio);
            targetHeight = Math.round(originalHeight * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Canvas 2D context unavailable');
          }

          // High quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Draw image to target canvas
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          // Determine target MIME type
          // WebP preserves alpha/transparency while offering superior compression
          const isTransparentSource = file.type === 'image/png' || file.type === 'image/webp';
          const targetMime = options.outputFormat || (isTransparentSource ? 'image/webp' : 'image/jpeg');
          const ext = targetMime === 'image/webp' ? '.webp' : targetMime === 'image/jpeg' ? '.jpg' : '.png';
          const cleanBaseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
          const outputFileName = `${cleanBaseName}${ext}`;

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('ไม่สามารถประมวลผลรูปภาพได้ กรุณาลองใหม่'));
                return;
              }

              const compressedFile = new File([blob], outputFileName, {
                type: targetMime,
                lastModified: Date.now(),
              });

              resolve(compressedFile);
            },
            targetMime,
            quality
          );
        } catch (err) {
          console.error('Image compression failure:', err);
          reject(new Error('ไม่สามารถประมวลผลรูปภาพได้ กรุณาลองใหม่'));
        }
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Compresses image and returns detailed result metrics with preview URL
 */
export async function compressImageWithMetrics(
  file: File,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const compressedFile = await compressImage(file, options);
  const previewUrl = URL.createObjectURL(compressedFile);

  return new Promise<CompressionResult>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        file: compressedFile,
        previewUrl,
        originalSize: file.size,
        compressedSize: compressedFile.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.onerror = () => {
      reject(new Error('ไม่สามารถประมวลผลรูปภาพได้ กรุณาลองใหม่'));
    };
    img.src = previewUrl;
  });
}

/**
 * Generates a small thumbnail File constrained to maxDimension (default 480px) 
 * for fast list/grid rendering.
 */
export async function generateThumbnail(
  file: File,
  maxDimension: number = IMAGE_MAX_DIMENSIONS.THUMBNAIL,
  options: CompressionOptions = {}
): Promise<File> {
  const quality = options.quality ?? IMAGE_COMPRESSION_QUALITY.THUMBNAIL;

  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (!validTypes.includes(file.type.toLowerCase())) {
    throw new Error('รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP');
  }

  return new Promise<File>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('ไม่สามารถประมวลผลรูปภาพ Thumbnail ได้'));
    };

    reader.onload = () => {
      const img = new Image();

      img.onerror = () => {
        reject(new Error('ไม่สามารถประมวลผลรูปภาพ Thumbnail ได้'));
      };

      img.onload = () => {
        try {
          const originalWidth = img.naturalWidth || img.width;
          const originalHeight = img.naturalHeight || img.height;

          if (!originalWidth || !originalHeight) {
            throw new Error('ไม่สามารถอ่านขนาดรูปภาพได้');
          }

          let targetWidth = originalWidth;
          let targetHeight = originalHeight;

          if (originalWidth > maxDimension || originalHeight > maxDimension) {
            const ratio = Math.min(maxDimension / originalWidth, maxDimension / originalHeight);
            targetWidth = Math.round(originalWidth * ratio);
            targetHeight = Math.round(originalHeight * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Canvas 2D context unavailable');
          }

          // High quality image smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          const targetMime = options.outputFormat || 'image/webp';
          const ext = targetMime === 'image/webp' ? '.webp' : targetMime === 'image/jpeg' ? '.jpg' : '.png';
          const cleanBaseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
          const outputFileName = `thumb_${cleanBaseName}${ext}`;

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('ไม่สามารถประมวลผลรูปภาพ Thumbnail ได้'));
                return;
              }

              const thumbFile = new File([blob], outputFileName, {
                type: targetMime,
                lastModified: Date.now(),
              });

              resolve(thumbFile);
            },
            targetMime,
            quality
          );
        } catch (err) {
          console.error('Thumbnail generation failure:', err);
          reject(new Error('ไม่สามารถประมวลผลรูปภาพ Thumbnail ได้'));
        }
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}
