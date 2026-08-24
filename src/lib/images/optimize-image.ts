export type ImagePreset = 'avatar' | 'tattoo-reference' | 'portfolio' | 'payment-proof';

export interface OptimizeOptions {
  preset: ImagePreset;
}

export async function optimizeImage(file: File, options: OptimizeOptions): Promise<File> {
  // Validate original file
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('รูปภาพต้องมีขนาดไม่เกิน 10 MB');
  }

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('รองรับเฉพาะไฟล์ JPG, PNG และ WebP เท่านั้น');
  }

  // Define preset configurations
  let maxLongestSide = 2000;
  let quality = 0.85;
  let isCenterCrop = false;

  switch (options.preset) {
    case 'avatar':
      maxLongestSide = 512;
      quality = 0.82;
      isCenterCrop = true;
      break;
    case 'tattoo-reference':
      maxLongestSide = 2000;
      quality = 0.85;
      isCenterCrop = false;
      break;
    case 'portfolio':
      maxLongestSide = 2400;
      quality = 0.88;
      isCenterCrop = false;
      break;
    case 'payment-proof':
      maxLongestSide = 2000;
      quality = 0.90;
      isCenterCrop = false;
      break;
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('ไฟล์รูปภาพไม่ถูกต้อง'));
    };
    
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      
      const { width, height } = img;
      
      // Calculate new dimensions
      let drawWidth = width;
      let drawHeight = height;
      let sx = 0, sy = 0, sw = width, sh = height;
      
      if (isCenterCrop) {
        const size = Math.min(width, height);
        sx = (width - size) / 2;
        sy = (height - size) / 2;
        sw = size;
        sh = size;
        
        if (size > maxLongestSide) {
          drawWidth = maxLongestSide;
          drawHeight = maxLongestSide;
        } else {
          drawWidth = size;
          drawHeight = size;
        }
      } else {
        if (width > maxLongestSide || height > maxLongestSide) {
          if (width > height) {
            drawWidth = maxLongestSide;
            drawHeight = Math.round((height * maxLongestSide) / width);
          } else {
            drawHeight = maxLongestSide;
            drawWidth = Math.round((width * maxLongestSide) / height);
          }
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = drawWidth;
      canvas.height = drawHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('เบราว์เซอร์ไม่รองรับการประมวลผลรูปภาพ'));
        return;
      }

      // Draw image onto canvas
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, drawWidth, drawHeight);
      
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('เกิดข้อผิดพลาดในการแปลงรูปภาพ'));
            return;
          }
          
          // Create a new File from the blob
          const fileName = file.name.replace(/\.[^/.]+$/, "") + ".webp";
          const optimizedFile = new File([blob], fileName, {
            type: 'image/webp',
            lastModified: Date.now(),
          });
          
          resolve(optimizedFile);
        },
        'image/webp',
        quality
      );
    };
    
    img.src = objectUrl;
  });
}
