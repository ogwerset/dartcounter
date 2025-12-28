/**
 * Frame differencing algorithm
 * Compares current frame against reference to detect new objects (darts)
 */

import type { Point, FrameDiffResult } from './types';

// Thresholds for detection
const DIFF_THRESHOLD = 30; // Minimum pixel difference to consider changed
const MIN_CONTOUR_AREA = 50; // Minimum area in pixels to be considered a dart
const MAX_CONTOUR_AREA = 10000; // Maximum area (filter out large changes like lighting)

/**
 * Convert RGB to grayscale (faster processing)
 */
function rgbToGrayscale(imageData: ImageData): Uint8Array {
  const gray = new Uint8Array(imageData.width * imageData.height);
  const data = imageData.data;
  
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    // Standard luminance formula
    gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  
  return gray;
}

/**
 * Compute absolute difference between two grayscale images
 */
function computeDifference(
  gray1: Uint8Array,
  gray2: Uint8Array,
  threshold: number
): Uint8Array {
  const diff = new Uint8Array(gray1.length);
  
  for (let i = 0; i < gray1.length; i++) {
    const d = Math.abs(gray1[i] - gray2[i]);
    diff[i] = d > threshold ? 255 : 0;
  }
  
  return diff;
}

/**
 * Apply morphological operations to clean up noise
 * Simple dilation followed by erosion
 */
function morphologyCleanup(
  binary: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const result = new Uint8Array(binary.length);
  
  // Dilation (3x3 kernel)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      let hasNeighbor = false;
      
      for (let dy = -1; dy <= 1 && !hasNeighbor; dy++) {
        for (let dx = -1; dx <= 1 && !hasNeighbor; dx++) {
          if (binary[(y + dy) * width + (x + dx)] === 255) {
            hasNeighbor = true;
          }
        }
      }
      
      result[idx] = hasNeighbor ? 255 : 0;
    }
  }
  
  return result;
}

/**
 * Simple flood-fill based connected component labeling
 * Returns array of contours (arrays of points)
 */
function findContours(
  binary: Uint8Array,
  width: number,
  height: number
): Point[][] {
  const visited = new Uint8Array(binary.length);
  const contours: Point[][] = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      
      if (binary[idx] === 255 && visited[idx] === 0) {
        // Found new contour, flood fill
        const contour: Point[] = [];
        const stack: Point[] = [{ x, y }];
        
        while (stack.length > 0) {
          const p = stack.pop()!;
          const pIdx = p.y * width + p.x;
          
          if (
            p.x >= 0 && p.x < width &&
            p.y >= 0 && p.y < height &&
            binary[pIdx] === 255 &&
            visited[pIdx] === 0
          ) {
            visited[pIdx] = 1;
            contour.push(p);
            
            // 4-connected neighbors
            stack.push({ x: p.x + 1, y: p.y });
            stack.push({ x: p.x - 1, y: p.y });
            stack.push({ x: p.x, y: p.y + 1 });
            stack.push({ x: p.x, y: p.y - 1 });
          }
        }
        
        if (contour.length >= MIN_CONTOUR_AREA && contour.length <= MAX_CONTOUR_AREA) {
          contours.push(contour);
        }
      }
    }
  }
  
  return contours;
}

/**
 * Calculate center of mass of a contour
 */
function calculateCenterOfMass(contour: Point[]): Point {
  let sumX = 0;
  let sumY = 0;
  
  for (const p of contour) {
    sumX += p.x;
    sumY += p.y;
  }
  
  return {
    x: sumX / contour.length,
    y: sumY / contour.length,
  };
}

/**
 * Find the tip of the dart (topmost point of contour)
 * Assumes dart is pointing somewhat toward the board
 */
function findDartTip(contour: Point[]): Point {
  // Find point furthest from center of mass
  const center = calculateCenterOfMass(contour);
  let maxDist = 0;
  let tip = contour[0];
  
  for (const p of contour) {
    const dist = Math.sqrt((p.x - center.x) ** 2 + (p.y - center.y) ** 2);
    if (dist > maxDist) {
      maxDist = dist;
      tip = p;
    }
  }
  
  return tip;
}

/**
 * Main frame differencing function
 * Compares current frame to reference and finds the dart
 */
export function detectFrameDifference(
  currentFrame: ImageData,
  referenceFrame: ImageData
): FrameDiffResult {
  const width = currentFrame.width;
  const height = currentFrame.height;
  
  // Convert to grayscale
  const currentGray = rgbToGrayscale(currentFrame);
  const referenceGray = rgbToGrayscale(referenceFrame);
  
  // Compute difference
  const diff = computeDifference(currentGray, referenceGray, DIFF_THRESHOLD);
  
  // Clean up noise
  const cleaned = morphologyCleanup(diff, width, height);
  
  // Find contours
  const contours = findContours(cleaned, width, height);
  
  // Find largest contour (most likely the dart)
  let largestContour: Point[] | null = null;
  let maxArea = 0;
  
  for (const contour of contours) {
    if (contour.length > maxArea) {
      maxArea = contour.length;
      largestContour = contour;
    }
  }
  
  // Create diff mask as ImageData
  const diffMask = new ImageData(width, height);
  for (let i = 0, j = 0; i < cleaned.length; i++, j += 4) {
    diffMask.data[j] = cleaned[i];
    diffMask.data[j + 1] = cleaned[i];
    diffMask.data[j + 2] = cleaned[i];
    diffMask.data[j + 3] = 255;
  }
  
  return {
    diffMask,
    largestContour,
    centerOfMass: largestContour ? calculateCenterOfMass(largestContour) : null,
    changeArea: maxArea,
  };
}

/**
 * Load image data from base64 data URL
 */
export function loadImageFromDataURL(
  dataURL: string,
  canvas: HTMLCanvasElement
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, img.width, img.height));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataURL;
  });
}

export { findDartTip };

