/**
 * 157 TATTOO — Global Client-Side Image Compression Utility
 * 
 * Rules:
 * 1. Compress file size without resizing pixel dimensions.
 * 2. Keep 100% original width, height, aspect ratio, and orientation.
 * 3. Default quality range: 0.80 - 0.85 (default 0.82).
 * 4. Supports JPG, JPEG, PNG, WEBP.
 * 5. Returns a standard File object ready for Supabase Storage.
 */

export interface CompressionOptions {
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
 * Compresses an image File in the browser while strictly preserving its original pixel dimensions.
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const quality = options.quality ?? 0.82;

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

          // Create canvas matching EXACT original dimensions (DO NOT RESIZE!)
          const canvas = document.createElement('canvas');
          canvas.width = originalWidth;
          canvas.height = originalHeight;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Canvas 2D context unavailable');
          }

          // Draw full resolution image 1:1
          ctx.drawImage(img, 0, 0, originalWidth, originalHeight);

          // Determine target MIME type
          // WebP preserves alpha/transparency while offering superior compression
          const targetMime = options.outputFormat || (file.type === 'image/png' ? 'image/webp' : 'image/jpeg');
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
