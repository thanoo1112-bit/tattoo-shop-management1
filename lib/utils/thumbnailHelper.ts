/**
 * 157 TATTOO — Image Thumbnail Helper Utility
 * 
 * Rules:
 * 1. Converts full public image URL or path to thumbnail WebP URL (thumb_<basename>.webp).
 * 2. Applies ONLY to 'flash' and 'portfolio' assets inside the public 'studio-assets' bucket.
 * 3. Does NOT modify slips or private customer reference images.
 * 4. Fallback: Returns original URL if input is empty, non-studio asset, or already a thumbnail.
 */

export function getThumbnailUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';

  // Only transform public studio assets under /flash/ or /portfolio/
  if (!url.includes('/studio-assets/flash/') && !url.includes('/studio-assets/portfolio/')) {
    return url;
  }

  // Already a thumbnail? Return as-is
  if (url.includes('/thumb_')) {
    return url;
  }

  // Replace filename extension with .webp and add thumb_ prefix
  // e.g. .../studio-assets/portfolio/abc.jpg -> .../studio-assets/portfolio/thumb_abc.webp
  // e.g. .../studio-assets/flash/xyz.webp -> .../studio-assets/flash/thumb_xyz.webp
  return url.replace(/(\/(?:flash|portfolio)\/)([^/]+?)(\.[^/.]*)?$/, '$1thumb_$2.webp');
}

/**
 * Image error handler for Flash and Portfolio thumbnails.
 * Requirement: If Thumbnail fails to load, DO NOT automatically fallback to full-size original image.
 * Instead, mark the image error state and display a placeholder with an optional user action to load the original image.
 */
export function handleThumbnailError(
  e: React.SyntheticEvent<HTMLImageElement, Event>,
  originalUrl: string
): void {
  const target = e.currentTarget;
  // Prevent infinite loop if already showing data URI placeholder or fallback
  if (target.dataset.hasError === 'true') return;
  target.dataset.hasError = 'true';

  // Set SVG placeholder image to avoid automatic high-res download
  target.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300' fill='%23171512'><rect width='400' height='300' fill='%23171512'/><text x='50%' y='45%' dominant-baseline='middle' text-anchor='middle' fill='%23807565' font-family='sans-serif' font-size='12'>ไม่พบรูป Thumbnail</text><text x='50%' y='60%' dominant-baseline='middle' text-anchor='middle' fill='%23C52B2B' font-family='sans-serif' font-size='10' font-weight='bold'>[แตะเพื่อดูรูปต้นฉบับ]</text></svg>";
  
  // Make clicking the placeholder load original image on explicit user action
  target.style.cursor = 'pointer';
  target.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (originalUrl) {
      target.src = originalUrl;
      target.onclick = null;
    }
  };
}

