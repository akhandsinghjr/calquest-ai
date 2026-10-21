import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export interface CapturedImage {
  base64Data: string; // raw base64 without data URL prefix
  mimeType: string;
  dataUrl: string; // full data:image/jpeg;base64,... for preview
}

/**
 * Compresses and resizes a dataUrl to max 1024px dimension JPEG
 * so uploads to Gemini 4 Argon are fast and localStorage stays lean.
 */
export async function compressImageDataUrl(
  dataUrl: string,
  maxDimension = 1024,
  quality = 0.82
): Promise<CapturedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to initialize image canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64Data = compressedDataUrl.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

      resolve({
        base64Data,
        mimeType: 'image/jpeg',
        dataUrl: compressedDataUrl,
      });
    };
    img.onerror = () => reject(new Error('Could not decode selected image'));
    img.src = dataUrl;
  });
}

export async function capturePhotoFromNativeOrWeb(
  mode: 'camera' | 'gallery'
): Promise<CapturedImage | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: mode === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        width: 1280,
      });

      if (!photo.dataUrl) return null;
      return await compressImageDataUrl(photo.dataUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes('cancel')) {
        return null;
      }
      throw err;
    }
  }

  return null;
}

export async function readFileAsCapturedImage(file: File): Promise<CapturedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = reader.result as string;
        const compressed = await compressImageDataUrl(dataUrl);
        resolve(compressed);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}
