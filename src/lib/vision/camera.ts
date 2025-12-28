/**
 * Camera service - getUserMedia wrapper with frame capture
 */

import type { CameraState, Point } from './types';

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' }, // Prefer rear camera
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30 },
  },
  audio: false,
};

/**
 * Request camera access and return the stream
 */
export async function requestCameraAccess(): Promise<MediaStream> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
    return stream;
  } catch (error) {
    if (error instanceof DOMException) {
      switch (error.name) {
        case 'NotAllowedError':
          throw new Error('Camera access denied. Please allow camera permission.');
        case 'NotFoundError':
          throw new Error('No camera found on this device.');
        case 'NotReadableError':
          throw new Error('Camera is already in use by another application.');
        case 'OverconstrainedError':
          throw new Error('Camera does not support the required resolution.');
        default:
          throw new Error(`Camera error: ${error.message}`);
      }
    }
    throw error;
  }
}

/**
 * Stop all tracks on a media stream
 */
export function stopCamera(stream: MediaStream): void {
  stream.getTracks().forEach((track) => {
    track.stop();
  });
}

/**
 * Capture a frame from video element to canvas
 */
export function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): ImageData | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  // Set canvas to match video dimensions
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Draw current video frame
  ctx.drawImage(video, 0, 0);

  // Return image data
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Capture frame as data URL (for reference storage)
 */
export function captureFrameAsDataURL(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  quality: number = 0.8
): string | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);

  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Get video dimensions
 */
export function getVideoDimensions(video: HTMLVideoElement): { width: number; height: number } {
  return {
    width: video.videoWidth,
    height: video.videoHeight,
  };
}

/**
 * Calculate touch/click position relative to video frame
 */
export function getVideoCoordinates(
  event: { clientX: number; clientY: number },
  video: HTMLVideoElement
): Point {
  const rect = video.getBoundingClientRect();
  
  // Scale factor between displayed size and actual video size
  const scaleX = video.videoWidth / rect.width;
  const scaleY = video.videoHeight / rect.height;
  
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

/**
 * Create initial camera state
 */
export function createInitialCameraState(): CameraState {
  return {
    isActive: false,
    hasPermission: false,
    error: null,
    stream: null,
  };
}

/**
 * Check if device has camera
 */
export async function hasCamera(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((device) => device.kind === 'videoinput');
  } catch {
    return false;
  }
}

