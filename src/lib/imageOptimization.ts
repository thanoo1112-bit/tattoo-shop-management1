export async function optimizeBookingReferenceImage(file: File): Promise<File> {
  // If not an image or unsupported type, reject
  if (!file.type.startsWith('image/')) {
    throw new Error('ไม่ใช่ไฟล์รูปภาพ');
  }

  try {
    // createImageBitmap handles EXIF orientation by default in modern browsers (orientation: 'from-image' is default)
    const bitmap = await createImageBitmap(file);
    
    const MAX_DIMENSION = 2000;
    let width = bitmap.width;
    let height = bitmap.height;

    // Calculate new dimensions keeping aspect ratio
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      if (width > height) {
        height = Math.round((height * MAX_DIMENSION) / width);
        width = MAX_DIMENSION;
      } else {
        width = Math.round((width * MAX_DIMENSION) / height);
        height = MAX_DIMENSION;
      }
    }

    // Create canvas and draw image
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      throw new Error('ไม่สามารถประมวลผลรูปภาพได้ (Canvas error)');
    }

    // Draw the image
    ctx.drawImage(bitmap, 0, 0, width, height);
    
    // Free the bitmap memory
    bitmap.close();

    return new Promise((resolve, reject) => {
      // Convert back to WebP with 0.85 quality
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('การบีบอัดรูปภาพล้มเหลว'));
            return;
          }

          // Create a new File from the blob
          // Filename uses original base name with .webp extension
          const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
          const optimizedFile = new File([blob], `${baseName}.webp`, {
            type: 'image/webp',
            lastModified: Date.now(),
          });

          resolve(optimizedFile);
        },
        'image/webp',
        0.85
      );
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`การประมวลผลรูปภาพล้มเหลว: ${error.message}`);
    }
    throw new Error('การประมวลผลรูปภาพล้มเหลว อาจจะเสียหายหรือรูปแบบไม่รองรับ');
  }
}
